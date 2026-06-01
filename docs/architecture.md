# Architecture

This document explains how opencode-talk is structured, how data flows through the system, and the design decisions that keep it safe and extensible.

## Table of Contents

- [High-level overview](#high-level-overview)
- [State machine](#state-machine)
- [Data flow](#data-flow)
- [Component interaction](#component-interaction)
- [Key design decisions](#key-design-decisions)
- [Error handling strategy](#error-handling-strategy)
- [Lifecycle](#lifecycle)

---

## High-level overview

opencode-talk is a **TUI plugin** for opencode. It does one thing: capture audio from your microphone, send it to a speech-to-text service, and inject the transcript into the chat prompt.

The architecture is deliberately simple — three layers, one data path:

```
┌─────────────────────────────────────────────────────────────┐
│  TUI Layer (index.js)                                       │
│  ─────────────────────                                      │
│  • Registers <leader>v keybind and /voice slash command     │
│  • Manages recording indicator animation                    │
│  • Reads user settings from KV store                        │
│  • Orchestrates: start → stop → transcribe → inject         │
└──────────────────────┬──────────────────────────────────────┘
                       │ calls
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Audio Layer (src/audio/recorder.ts)                        │
│  ───────────────────────────────────                        │
│  • Auto-detects ffmpeg / sox / parecord                     │
│  • Spawns child process to capture to temp WAV file         │
│  • Handles SIGTERM / SIGKILL cleanup                        │
│  • Validates process didn't exit immediately                │
└──────────────────────┬──────────────────────────────────────┘
                       │ returns temp file path
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Transcription Layer (src/transcription/openai.ts)          │
│  ─────────────────────────────────────────────────          │
│  • Streams WAV file to OpenAI Whisper API                   │
│  • Validates file size (<25MB), non-empty                   │
│  • Retries on 429 (rate limit) and network errors           │
│  • Respects AbortSignal for cancellation                    │
│  • Returns plain text transcript                            │
└─────────────────────────────────────────────────────────────┘
```

---

## State machine

The plugin has no explicit state variable. Instead, state is implicit in the combination of:

1. `recorder.isRecording()` — is the mic on?
2. `recordingIndicator` interval — is the UI animating?
3. Whether we're inside the `transcribe()` call

This maps to three observable states:

| State | Condition | What the user sees |
|-------|-----------|-------------------|
| **Idle** | `!rec.isRecording()` | Nothing special |
| **Recording** | `rec.isRecording()` | `Listening ···` toast cycling |
| **Transcribing** | `!rec.isRecording()` but awaiting `transcribe()` | `Transcribing...` toast |

### Why no explicit state machine?

Because opencode handles plugin lifecycle for us. The plugin is loaded once per TUI session. There's no background process, no event loop we own. The only concurrent work is:

- The `setInterval` for the recording indicator (UI only)
- The in-flight HTTP request to Whisper (network only)

Both are bounded and short-lived. Adding a formal state machine would introduce complexity without solving a real problem.

---

## Data flow

### Happy path

```
User presses <leader>v
  │
  ▼
index.js:onSelect()
  │
  ├── rec.isRecording()? → false
  │
  ├── rec.start()
  │     ├── detectAudioTool() → "ffmpeg"
  │     ├── createTempFile(".wav") → "/tmp/opencode-talk-abc.wav"
  │     ├── spawn ffmpeg -f alsa -i default ... /tmp/opencode-talk-abc.wav
  │     └── wait 500ms to confirm process didn't exit immediately
  │
  ├── startRecordingIndicator() → toast("Listening ·") every 500ms
  │
  └── return (user is now recording)

User presses <leader>v again
  │
  ▼
index.js:onSelect()
  │
  ├── stopRecordingIndicator() → clearInterval
  │
  ├── rec.stop()
  │     ├── child.kill("SIGTERM")
  │     ├── await exit (or 3s timeout)
  │     └── SIGKILL if still alive
  │
  ├── toast("Transcribing...")
  │
  ├── prov.transcribe("/tmp/opencode-talk-abc.wav")
  │     ├── stat() → 45KB ✓
  │     ├── createReadStream() → OpenAI API
  │     └── return "Refactor auth middleware to use JWT..."
  │
  ├── cleanupTempFile("/tmp/opencode-talk-abc.wav")
  │
  ├── api.client.tui.appendPrompt({ text })
  │
  └── toast("Transcription Done — Refactor auth...")
```

### Cancellation path

```
User presses <leader>v (starts recording)
  │
  └── User presses <leader>v again quickly (or recording is empty)
      │
      ├── rec.stop() → process killed
      ├── getTempFile() → returns path (but file might be tiny/empty)
      ├── prov.transcribe()
      │     ├── stat() → 0 bytes
      │     └── throw "Audio file is empty."
      │
      ├── catch(err)
      │     ├── stopRecordingIndicator()
      │     └── toast("Voice Error — Audio file is empty.")
      │
      └── cleanupTempFile() (called in finally or next start)
```

---

## Component interaction

### index.js (the orchestrator)

`index.js` is the **only** file opencode loads. It must export a `PluginModule`:

```javascript
export default {
  id: "opencode-talk",
  tui: async (api) => { /* ... */ }
};
```

The `tui` function receives `api` — the full opencode TUI plugin API. We use five things from it:

| API | Purpose |
|-----|---------|
| `api.command.register()` | Register `/voice` and `/voice-config` commands |
| `api.ui.toast()` | Show ephemeral notifications |
| `api.ui.dialog.replace()` | Open settings menus |
| `api.client.tui.appendPrompt()` | Inject transcript into chat input |
| `api.kv.get()` / `api.kv.set()` | Persist user settings |

`index.js` does **not** import `@opencode-ai/plugin` directly. We duck-type the API so the plugin works even when that package isn't installed locally (important for standalone bundling and testing).

### Lazy initialization

Both `recorder` and `provider` are created on first use, not at plugin load time:

```javascript
function getRecorder() {
  if (!recorder) {
    recorder = new FfmpegRecorder({ audioDevice: cfg.audioDevice }, noop);
  }
  return recorder;
}
```

This defers microphone permission prompts and API client construction until the user actually triggers voice. It also makes `resetInstances()` easy — just set both to `null` and the next call will recreate them fresh (used after settings changes).

### Settings ↔ Runtime coupling

When you change the API key or model via `/voice-config`, `resetInstances()` is called. This destroys the old `OpenAiWhisperProvider` (with the old key) and `FfmpegRecorder` (with the old device). The next `<leader>v` creates fresh instances from the updated KV values.

---

## Key design decisions

### 1. No build artifact for development

`index.js` imports `./src/*.ts` files. Bun runs TypeScript natively. No `tsc`, no `dist/` directory, no watch mode needed. The only build step is `bun build` when producing a single-file bundle for distribution.

**Trade-off:** Users must have Bun installed. (They already do if they're using opencode.)

### 2. Single-file TUI export

The official opencode plugin contract requires `PluginModule = { id, tui }` or `{ id, server }`. We export only `tui`. There's no server-side component because voice transcription is a user-initiated action, not an AI tool.

Wait — there's also `src/server.ts` which exports a `voiceToggle` tool. Why?

Historical artifact. Early versions exposed voice as an AI-callable tool. We kept `src/server.ts` in the repo for reference, but `index.js` (the TUI entrypoint) is what actually gets loaded by opencode. The server file is not imported by `index.js`.

### 3. Process-per-recording

We spawn a new ffmpeg/sox/parecord process every time. No background daemon, no persistent microphone access. This is the only safe model inside a terminal plugin — we don't want to hold the mic open between commands.

**Trade-off:** 200–500ms overhead per recording start (process spawn + 500ms validation window). Acceptable for human-scale interactions.

### 4. Temp files in `/tmp`

Files are named `opencode-talk-{16 random hex chars}.wav`. They live in `os.tmpdir()`. `cleanupTempFile()` is called on every path: success, error, cancellation, and plugin unload. The `no-ops if missing` design means double-cleanup is harmless.

### 5. AbortSignal propagation

The `TranscriptionProvider.transcribe(audioPath, signal?)` interface accepts an optional `AbortSignal`. The OpenAI provider passes this through to the SDK:

```typescript
await this.client.audio.transcriptions.create(
  { file: stream, model: this.model },
  { signal }  // ← aborts the HTTP request
);
```

This means cancellation during transcribe actually kills the TCP connection, not just the promise wrapper. Important for saving API costs and bandwidth.

### 6. No dependencies on `@opencode-ai/plugin` for types

`src/types.ts` defines `OpencodePluginContext` manually. This avoids making `@opencode-ai/plugin` a hard dependency, which simplifies bundling and testing. We validate at runtime (duck typing), not compile time.

---

## Error handling strategy

Errors are caught at three boundaries:

### 1. Recorder boundary (`index.js` try/catch)

Catches:
- Missing audio tools
- Permission denied on device
- Process exit during the 500ms validation window

Action: `toast({ variant: "error", ... })`, stop indicator if running.

### 2. Provider boundary (`OpenAiWhisperProvider.transcribe()`)

Catches and maps:
- 401 → "Invalid OpenAI API key"
- 429 → Retry with exponential backoff (max 3 retries)
- Network errors → Retry (max 3 retries)
- Other → Fatal error, no retry

All other errors bubble up to the caller.

### 3. Orchestrator boundary (`index.js` try/catch around full flow)

Catches everything else. Guarantees:
- `stopRecordingIndicator()` is always called
- `toast({ variant: "error", ... })` is shown
- The plugin remains in a usable state (no hung intervals, no orphaned processes)

## Lifecycle

```
opencode startup
  │
  ├── Load tui.json → resolve "opencode-talk" path
  │
  ├── import() index.js → execute tui(api)
  │     ├── Register commands (not executed yet)
  │     └── Return (plugin is now "loaded")
  │
  └── TUI is ready

User presses <leader>v
  │
  └── Command onSelect() executes → see Data Flow above

opencode exit / session end
  │
  └── JavaScript context is destroyed
      └── recorder.child is SIGKILL'd by OS (or leaks if we forgot cleanup)
```

**Important:** We do not currently hook into opencode's `onDispose` or `server.disconnect` events for extra cleanup. The recorder's `cleanup()` method exists but is only called explicitly on settings reset. In practice, the OS cleans up child processes when the parent (opencode) exits. For long-running opencode sessions with many recordings, this is safe because each recording spawns and kills its own process.

---

## Extending the architecture

See [Development Guide](development.md) for concrete steps. At the architecture level, adding a feature means answering:

1. **Which layer?** — TUI (new command), Audio (new capture tool), or Transcription (new provider)?
2. **State impact?** — Do we need new implicit state, or can we reuse `isRecording()` / indicator?
3. **Cleanup responsibility?** — What must be torn down in `resetInstances()`, `catch`, or `cleanup()`?
4. **KV persistence?** — Should the new setting survive restarts?
