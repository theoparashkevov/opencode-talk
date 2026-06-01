# Components

This document describes every module in the `src/` directory — what it does, its public API, internal details, and how it interacts with the rest of the system.

---

## Table of Contents

- [src/index.ts](#srcindexts) — *(unused — server entrypoint, kept for reference)*
- [src/audio/recorder.ts](#srcaudiorecorderts) — Audio capture engine
- [src/transcription/openai.ts](#srctranscriptionopenaits) — OpenAI Whisper provider
- [src/settings.ts](#srcsettingsts) — KV-backed user configuration
- [src/types.ts](#srctypests) — Shared interfaces and schemas
- [src/utils.ts](#srcutilsts) — Cross-cutting utilities
- [src/config.ts](#srcconfigts) — Legacy env-var config resolver

---

## `src/audio/recorder.ts`

**Responsibility:** Detect available audio capture tools, spawn the selected tool as a child process, and manage its lifecycle (start, stop, cleanup).

### Public API

```typescript
export async function detectAudioTool(): Promise<AudioTool>
export function buildArgs(tool: AudioTool, outputPath: string, device?: string): string[]

export class FfmpegRecorder implements AudioRecorder {
  constructor(opts?: FfmpegRecorderOptions, log?: LogFn)
  async start(audioDevice?: string): Promise<string>  // returns temp file path
  async stop(): Promise<void>
  isRecording(): boolean
  async cleanup(): Promise<void>
  getTempFile(): string | null
}
```

### Tool detection (`detectAudioTool`)

Runs `which <tool>` in order:

1. `ffmpeg`
2. `sox`
3. `parecord` (Linux only)

Throws a helpful error if none are found. This is called once per `FfmpegRecorder` instance (lazy), not at plugin load time.

### Command builders (`buildArgs`)

| Tool | Platform | Command generated |
|------|----------|-------------------|
| ffmpeg | macOS | `-f avfoundation -i :0 ...` |
| ffmpeg | Linux | `-f alsa -i default ...` |
| ffmpeg | Windows | `-f dshow -i default ...` |
| sox | All | `sox -d <output>` |
| parecord | Linux | `parecord <output> [-d <device>]` |

ffmpeg uses 16kHz mono PCM WAV — the format Whisper expects.

### `start()` internals

1. Detect tool (if not cached)
2. Create temp file via `createTempFile(".wav")`
3. `spawn()` the process
4. **Wait 500ms** — if the process exits or errors in this window, reject immediately. This catches bad device names, missing permissions, and missing libraries before the user starts speaking.
5. Resolve with the temp file path

The 500ms validation window is critical. Without it, the user could start speaking, finish, and only then discover the recording failed.

### `stop()` internals

1. Save `child` reference locally, set `this.child = null`
2. Send `SIGTERM`
3. Wait for `exit` event (or 3-second timeout)
4. If process still hasn't exited, send `SIGKILL`

The early nullification (`this.child = null`) prevents `cleanup()` from trying to kill the same process again.

### `cleanup()` internals

Used when the plugin wants to force-abort everything:

1. Check if `this.child` exists and isn't killed
2. `SIGTERM`, wait up to 1.5s
3. `SIGKILL` if still alive
4. Delete temp file if it exists

This is called by `resetInstances()` when settings change, ensuring no stale processes linger.

---

## `src/transcription/openai.ts`

**Responsibility:** Send a WAV file to OpenAI's Whisper API and return the transcribed text.

### Public API

```typescript
export class OpenAiWhisperProvider implements TranscriptionProvider {
  constructor(config: PluginConfig & { prompt?: string }, log?: LogFn)
  async transcribe(audioPath: string, signal?: AbortSignal): Promise<string>
}
```

### Validation

Before uploading:

1. `stat(audioPath)` — must be <25MB (OpenAI's hard limit)
2. File must not be empty (0 bytes usually means the mic was muted or the recording was too short)

If validation fails, throws immediately — no network call, no API cost.

### Retry logic

The provider uses a `for` loop with up to 3 retries:

| Error type | Behavior |
|------------|----------|
| `signal.aborted` | Throw immediately: "Transcription cancelled by user." |
| HTTP 401 | Throw immediately: bad API key |
| HTTP 429 | Retry with exponential backoff: 1s → 2s → 4s (capped at 8s) |
| Network error (`fetch`, `ECONNREFUSED`) | Retry with same backoff |
| Other errors | Throw immediately |

This is simpler than a full retry library (like `p-retry`) because our surface area is small and we want full control over per-status behavior.

### Prompt support

OpenAI's Whisper API accepts an optional `prompt` parameter that guides transcription style:

```typescript
await this.client.audio.transcriptions.create({
  file: stream,
  model: this.model,
  prompt: "Use Australian English spelling. Preserve variable names.",
});
```

We expose this via the `customPrompt` setting in `/voice-config`.

---

## `src/settings.ts`

**Responsibility:** Read and write user preferences to opencode's KV store, with sensible defaults and a namespaced key schema.

### Public API

```typescript
export interface TalkConfig {
  apiKey: string;
  model: string;
  audioDevice?: string;
  customPrompt: string;
  showRecordingToast: boolean;
  showTranscriptionToast: boolean;
}

export const DEFAULTS: TalkConfig;

export function getConfig(kv: { get: (key: string, fallback?: unknown) => unknown }): TalkConfig
export function setConfig(kv: { set: (key: string, value: unknown) => void }, patch: Partial<TalkConfig>): void
```

### KV key schema

All keys are prefixed with `opencode-talk.` to avoid collisions with other plugins:

| Setting | KV Key |
|---------|--------|
| API Key | `opencode-talk.apiKey` |
| Model | `opencode-talk.model` |
| Audio Device | `opencode-talk.audioDevice` |
| Custom Prompt | `opencode-talk.customPrompt` |
| Show Recording Toast | `opencode-talk.showRecordingToast` |
| Show Transcription Toast | `opencode-talk.showTranscriptionToast` |

### Default resolution

`DEFAULTS.apiKey` falls back to `process.env.OPENAI_API_KEY || ""`. This means if the user has the env var set but never visits `/voice-config`, the plugin still works.

If the user clears a setting in `/voice-config` (sets it to `undefined`), `setConfig` writes the default value back. This is how "Reset to Defaults" works without special-casing each key.

---

## `src/types.ts`

**Responsibility:** Define every interface, schema, and type alias used across the codebase. This is the only file that imports `zod`.

### Key interfaces

#### `TranscriptionProvider`

The abstraction boundary for STT backends:

```typescript
export interface TranscriptionProvider {
  transcribe(audioPath: string, signal?: AbortSignal): Promise<string>;
}
```

All providers must accept:
- `audioPath`: absolute path to a WAV file
- `signal?`: optional `AbortSignal` for cancellation

And must return: plain text transcript (no metadata, no confidence scores).

#### `AudioRecorder`

The abstraction boundary for audio capture:

```typescript
export interface AudioRecorder {
  start(audioDevice?: string): Promise<string>;
  stop(): Promise<void>;
  isRecording(): boolean;
  cleanup(): Promise<void>;
}
```

#### `AudioTool`

Union type of supported CLI tools:

```typescript
export type AudioTool = "ffmpeg" | "sox" | "parecord";
```

#### `PluginConfig` (Zod schema)

Runtime-validated configuration:

```typescript
export const pluginConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  provider: z.enum(["openai"] as const).default("openai"),
  model: z.string().default("whisper-1"),
  audioDevice: z.string().optional(),
});
```

### Duck-typed opencode API

Because `@opencode-ai/plugin` is a peer dependency (optional), we define the parts of the API we use:

```typescript
export interface OpencodePluginContext {
  project: string;
  directory: string;
  worktree: string;
  $: unknown;
  client: {
    app: {
      log: (payload: { body: OpencodeAppLogBody }) => void;
      emit?: (event: string, payload: unknown) => void;
    };
  };
}
```

This is a subset of the actual `TuiPluginApi` type. We only define what we touch, keeping the dependency graph minimal.

---

## `src/utils.ts`

**Responsibility:** Cross-cutting utilities used by multiple modules. No business logic, just reliable primitives.

### Temp files

```typescript
export async function createTempFile(suffix: string): Promise<string>
export async function cleanupTempFile(path: string): Promise<void>
```

- Files are created with `randomBytes(8).toString("hex")` for collision resistance
- `cleanupTempFile` is idempotent — safe to call twice on the same path
- Files live in `os.tmpdir()` — usually `/tmp` on Linux/macOS

### Logging

```typescript
export type LogLevel = "debug" | "info" | "warn" | "error";

export function createLogAdapter(ctx: OpencodePluginContext): LogFn
export function setLogAdapter(adapter: LogFn): void
export function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void
```

`createLogAdapter` bridges to opencode's structured logging API. Inside opencode, logs go through `client.app.log()`. In tests, they fall back to `console.log(JSON.stringify(...))`.

`setLogAdapter` exists purely for test injection — tests can capture log calls without mocking `console`.

### Error formatting

```typescript
export function formatError(error: unknown): string
```

Safely extracts a message from any thrown value. Handles:
- `Error` instances → `.message`
- Strings → `String(error)`
- `null` / `undefined` / objects → `"Unknown error"`

### Safe spawn

```typescript
export function safeSpawn(
  command: string,
  args: string[],
  opts?: { timeout?: number; env?: ProcessEnv; cwd?: string; signal?: AbortSignal }
): Promise<{ exitCode: number | null; stdout: string; stderr: string }>
```

A `spawn` wrapper with:
- **Timeout** (default 60s) → `SIGTERM`, then `SIGKILL` 2s later
- **Signal propagation** — passes through an external `AbortSignal`
- **Output capture** — collects stdout and stderr as strings

Used by `detectAudioTool()` (to run `which ffmpeg`) and available for future features (e.g. running local whisper.cpp CLI).

---

## `src/config.ts`

**Responsibility:** Legacy env-var based configuration resolver. Kept for backward compatibility with server-side usage.

### Public API

```typescript
export function resolveConfig(input?: Record<string, unknown>): PluginConfig
export const defaultConfig: PluginConfig;
```

### Behavior

1. Clone the input object
2. If `apiKey` is missing, scan `OPENAI_API_KEY` and `OPENAI_KEY` env vars
3. Validate with Zod schema
4. Throw on invalid config with detailed error message

### Usage in the TUI plugin

The TUI plugin (`index.js`) does **not** use `resolveConfig`. Instead, it uses `getConfig()` from `settings.ts` which reads from `api.kv`. `config.ts` is only referenced by `src/server.ts` (the legacy server entrypoint) and older tests.

If you're adding a new setting, modify `settings.ts`, not `config.ts`.
