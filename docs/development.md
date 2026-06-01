# Development Guide

How to hack on opencode-talk: run, test, debug, and extend.

---

## Table of Contents

- [Getting started](#getting-started)
- [Running tests](#running-tests)
- [Adding a new transcription provider](#adding-a-new-transcription-provider)
- [Adding a new audio capture backend](#adding-a-new-audio-capture-backend)
- [Adding a new settings toggle](#adding-a-new-settings-toggle)
- [Adding a new TUI command](#adding-a-new-tui-command)
- [Debugging tips](#debugging-tips)
- [Code style](#code-style)

---

## Getting started

```bash
# 1. Clone
git clone https://github.com/theoparashkevov/opencode-talk.git
cd opencode-talk

# 2. Install
bun install

# 3. Type check
bun run typecheck

# 4. Run tests
bun test

# 5. Try it live
export OPENAI_API_KEY="sk-..."
# symlink into opencode tui.json, then:
opencode
```

No build step needed for development — Bun runs TypeScript natively.

---

## Running tests

```bash
bun test
```

37 tests across 5 files. All should pass.

### Test structure

```
src/__tests__/
├── config.test.ts      # Config schema validation, env var resolution
├── plugin.test.ts      # Plugin initialization, command registration
├── provider.test.ts    # OpenAI provider: retry logic, cancellation, validation
├── recorder.test.ts    # Audio recorder: buildArgs, process lifecycle, cleanup
└── utils.test.ts       # Temp files, logging, error formatting, safeSpawn
```

### Writing a new test

Tests use Bun's built-in test runner (`bun:test`):

```typescript
import { test, expect } from "bun:test";
import { MyNewFeature } from "../my-new-feature.js";

test("my new feature does X", async () => {
  const result = await MyNewFeature.doX();
  expect(result).toBe("expected");
});
```

Logging in tests goes to stdout as JSON lines ( captured by `setLogAdapter` in test setup if needed).

---

## Adding a new transcription provider

This is the most common extension. Let's add a **local whisper.cpp** provider.

### Step 1: Create the provider file

```typescript
// src/transcription/whispercpp.ts
import { TranscriptionProvider } from "../types.js";
import { safeSpawn, formatError } from "../utils.js";

export interface WhisperCppConfig {
  modelPath: string;   // path to ggml model bin
  executable?: string; // path to whisper.cpp main binary
}

export class WhisperCppProvider implements TranscriptionProvider {
  private config: WhisperCppConfig;

  constructor(config: WhisperCppConfig) {
    this.config = config;
  }

  async transcribe(audioPath: string, signal?: AbortSignal): Promise<string> {
    const bin = this.config.executable ?? "./whisper.cpp/main";
    const result = await safeSpawn(bin, [
      "-m", this.config.modelPath,
      "-f", audioPath,
      "--output-txt", "--no-timestamps",
    ], { signal, timeout: 120_000 });

    if (result.exitCode !== 0) {
      throw new Error(`whisper.cpp failed: ${result.stderr}`);
    }

    // whisper.cpp writes output to audioPath.txt
    const txtPath = audioPath + ".txt";
    const text = await Bun.file(txtPath).text();
    await Bun.write(txtPath, ""); // clear to avoid leaking next time
    return text.trim();
  }
}
```

### Step 2: Add KV settings

```typescript
// src/settings.ts
export interface TalkConfig {
  // ... existing fields ...
  provider: "openai" | "whispercpp";
  whisperCppModelPath?: string;
  whisperCppExecutable?: string;
}

export const DEFAULTS: TalkConfig = {
  // ... existing defaults ...
  provider: "openai",
};
```

### Step 3: Wire into index.js

```typescript
// index.js
import { WhisperCppProvider } from "./src/transcription/whispercpp.js";

function getProvider() {
  const cfg = getConfig(kv);
  if (!provider) {
    if (cfg.provider === "whispercpp") {
      provider = new WhisperCppProvider({
        modelPath: cfg.whisperCppModelPath,
        executable: cfg.whisperCppExecutable,
      });
    } else {
      provider = new OpenAiWhisperProvider({ ... });
    }
  }
  return provider;
}
```

### Step 4: Add UI for new settings

In `openSettingsMenu()`, add new `DialogPrompt` entries for `whisperCppModelPath` and `whisperCppExecutable`.

---

## Adding a new audio capture backend

Let's say you want to support **Python's `sounddevice`** module as a recorder.

### Step 1: Implement `AudioRecorder`

```typescript
// src/audio/sounddevice-recorder.ts
import { AudioRecorder } from "../types.js";
import { createTempFile, cleanupTempFile } from "../utils.js";
import { spawn } from "node:child_process";

export class SoundDeviceRecorder implements AudioRecorder {
  private child: ReturnType<typeof spawn> | null = null;
  private tempFile: string | null = null;

  async start(): Promise<string> {
    const tempFile = await createTempFile(".wav");
    this.tempFile = tempFile;
    this.child = spawn("python3", [
      "-c",
      `import sounddevice as sd; import wavio; 
       rec = sd.rec(frames=96000, samplerate=16000, channels=1, dtype='int16');
       sd.wait();
       wavio.write("${tempFile}", rec, 16000, sampwidth=2);`
    ]);
    return tempFile;
  }

  async stop(): Promise<void> {
    this.child?.kill("SIGTERM");
    this.child = null;
  }

  isRecording(): boolean {
    return this.child !== null && !this.child.killed;
  }

  async cleanup(): Promise<void> {
    await this.stop();
    if (this.tempFile) {
      await cleanupTempFile(this.tempFile);
      this.tempFile = null;
    }
  }

  getTempFile(): string | null {
    return this.tempFile;
  }
}
```

### Step 2: Add to `detectAudioTool` or bypass detection

Option A: Add `"sounddevice"` to the detection chain in `recorder.ts`.

Option B: Skip detection and let users opt-in via settings:

```typescript
const recorder = cfg.recorder === "sounddevice"
  ? new SoundDeviceRecorder()
  : new FfmpegRecorder({ audioDevice: cfg.audioDevice });
```

---

## Adding a new settings toggle

Let's add `"autoSend"` — whether to automatically submit the prompt after transcription.

### Step 1: Update schema

```typescript
// src/settings.ts
export interface TalkConfig {
  // ... existing fields ...
  autoSend: boolean;
}

export const DEFAULTS: TalkConfig = {
  // ... existing defaults ...
  autoSend: false,
};

const KV_KEYS = {
  // ... existing keys ...
  autoSend: KV_PREFIX + "autoSend",
};
```

### Step 2: Update getConfig / setConfig

Both functions iterate over `KV_KEYS` dynamically, so if you add the key to `KV_KEYS` and the field to `TalkConfig`/`DEFAULTS`, `getConfig` and `setConfig` will handle it automatically.

### Step 3: Add UI toggle

In `index.js` → `openSettingsMenu()`:

```javascript
{
  title: `Auto-send prompt    ${cfg.autoSend ? "(on)" : "(off)"}`,
  value: "autoSend",
  description: "Automatically submit after transcription",
  onSelect: () => {
    const next = !cfg.autoSend;
    setConfig(kv, { autoSend: next });
    toast({ variant: "success", title: "Saved", message: `Auto-send: ${next ? "on" : "off"}` });
    api.ui.dialog.clear();
  },
}
```

### Step 4: Implement behavior

In `index.js` → `onSelect`:

```javascript
const cfg = getConfig(kv);
if (cfg.autoSend) {
  // Trigger prompt submission — api.command.trigger("submit") or similar
}
```

*(Note: opencode may not expose a direct "submit prompt" API. This is illustrative.)*

### Step 5: Update Reset to Defaults

The reset already loops over all `KV_KEYS` entries and resets to `DEFAULTS`, so no code change needed there.

---

## Adding a new TUI command

Let's add `/voice-history` to list recent transcriptions.

### Step 1: Register the command

```javascript
api.command.register(() => [
  // ... existing commands ...
  {
    title: "Voice History",
    value: "voiceHistory",
    description: "Show recent transcriptions",
    category: "Voice",
    slash: { name: "voice-history", aliases: ["vh"] },
    onSelect: () => showHistoryMenu(kv),
  },
]);
```

### Step 2: Implement the menu

```javascript
function showHistoryMenu(kv) {
  const history = kv.get("opencode-talk.history", []) as string[];
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect({
      title: "Recent Transcriptions",
      options: history.slice(-10).reverse().map((text, i) => ({
        title: text.slice(0, 50) + (text.length > 50 ? "…" : ""),
        value: String(i),
        onSelect: () => {
          api.client.tui.appendPrompt({ text });
          api.ui.dialog.clear();
        },
      })),
    })
  );
}
```

### Step 3: Store history

In the transcription success path, append to history:

```javascript
const history = kv.get("opencode-talk.history", []) as string[];
history.push(text);
kv.set("opencode-talk.history", history.slice(-50)); // keep last 50
```

---

## Debugging tips

### Enable debug logging

Set opencode's log level to `DEBUG`:

```bash
opencode --log-level DEBUG
```

Plugin logs include:
- `Resolved API key from environment variable`
- `Starting audio recording` (with tool, tempFile, device)
- `Transcription complete` (with text length)
- `OpenAI rate limited, retrying...`

### Check if the recorder spawned correctly

```bash
# While recording, in another terminal:
ps aux | grep ffmpeg
lsof | grep opencode-talk  # see temp files
```

### Test audio capture independently

```bash
# ffmpeg
ffmpeg -f alsa -i default -t 5 /tmp/test.wav

# sox
sox -d /tmp/test.wav

# parecord
parecord /tmp/test.wav
```

If these fail, the plugin can't work either.

### Test Whisper API independently

```bash
curl https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F file="@/tmp/test.wav" \
  -F model="whisper-1"
```

### Inspect KV store

opencode stores KV data in SQLite (location varies by install). There's no official CLI to inspect it, but you can add temporary logging:

```javascript
console.log("KV dump:", {
  apiKey: kv.get("opencode-talk.apiKey"),
  model: kv.get("opencode-talk.model"),
});
```

---

## Code style

- **2-space indentation**
- **Single quotes** for strings (except when needing backticks for interpolation)
- ** Explicit types** on exported functions — inference is fine for internals
- **No `any`** — use `unknown` with narrowing, or `Record<string, unknown>`
- **Early returns** preferred over deep nesting
- **JSDoc comments** on all public functions and interfaces
- **Error messages** should be actionable: "Install ffmpeg" not "Tool not found"

### File organization

- One public class per file (e.g. `OpenAiWhisperProvider` → `src/transcription/openai.ts`)
- Pure functions extracted to `src/utils.ts`
- Platform-specific logic isolated in `buildArgs()`, not scattered
