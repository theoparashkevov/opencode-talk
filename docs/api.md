# API Reference

This document lists every public type, function, class, and interface exported by opencode-talk. It's intended for developers who want to use the plugin programmatically or extend it.

For higher-level context, see [Architecture](architecture.md) and [Components](components.md).

---

## Table of Contents

- [Interfaces](#interfaces)
- [Classes](#classes)
- [Functions](#functions)
- [Types & Enums](#types--enums)
- [Constants](#constants)

---

## Interfaces

### `AudioRecorder`

```typescript
// src/types.ts
export interface AudioRecorder {
  start(audioDevice?: string): Promise<string>;
  stop(): Promise<void>;
  isRecording(): boolean;
  cleanup(): Promise<void>;
}
```

Contract for audio capture backends. Must be implemented by any new recorder (e.g. a native Node.js audio binding).

| Method | Returns | Description |
|--------|---------|-------------|
| `start(audioDevice?)` | `Promise<string>` | Begin recording. Returns the temp file path that will be written to. |
| `stop()` | `Promise<void>` | Stop recording and finalize the file. |
| `isRecording()` | `boolean` | Whether a recording is currently in progress. |
| `cleanup()` | `Promise<void>` | Force-kill any running process and delete the temp file. |

---

### `TranscriptionProvider`

```typescript
// src/types.ts
export interface TranscriptionProvider {
  transcribe(audioPath: string, signal?: AbortSignal): Promise<string>;
}
```

Contract for speech-to-text backends. Must be implemented by any new provider (e.g. Google Cloud Speech, Azure, local Whisper).

| Method | Returns | Description |
|--------|---------|-------------|
| `transcribe(path, signal?)` | `Promise<string>` | Send audio file to STT service and return plain text. |

**Parameters:**
- `audioPath` — Absolute path to the audio file (usually WAV)
- `signal` — Optional `AbortSignal`. If triggered, the provider should cancel the in-flight request.

---

### `TalkConfig`

```typescript
// src/settings.ts
export interface TalkConfig {
  apiKey: string;
  model: string;
  audioDevice?: string;
  customPrompt: string;
  showRecordingToast: boolean;
  showTranscriptionToast: boolean;
}
```

Complete user-facing configuration. All fields are persisted via `api.kv`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | `string` | `$OPENAI_API_KEY` | OpenAI API key. Falls back to env var if not set in KV. |
| `model` | `string` | `"whisper-1"` | Whisper model identifier. |
| `audioDevice` | `string?` | `undefined` | Audio input device name or index. System default if omitted. |
| `customPrompt` | `string` | `"Transcribe the following audio accurately..."` | Prompt sent to Whisper alongside audio. |
| `showRecordingToast` | `boolean` | `true` | Show animated `Listening ···` indicator while recording. |
| `showTranscriptionToast` | `boolean` | `true` | Show success toast after transcription completes. |

---

## Classes

### `FfmpegRecorder`

```typescript
// src/audio/recorder.ts
class FfmpegRecorder implements AudioRecorder {
  constructor(opts?: FfmpegRecorderOptions, log?: LogFn)
  async start(audioDevice?: string): Promise<string>
  async stop(): Promise<void>
  isRecording(): boolean
  async cleanup(): Promise<void>
  getTempFile(): string | null
}
```

Audio recorder that auto-detects and wraps `ffmpeg`, `sox`, or `parecord`.

**Constructor options:**

```typescript
interface FfmpegRecorderOptions {
  tool?: AudioTool;        // Override auto-detection
  audioDevice?: string;    // Default device for all recordings
}
```

**Example:**

```typescript
import { FfmpegRecorder } from "./src/audio/recorder.js";

const recorder = new FfmpegRecorder({ audioDevice: "plughw:1,0" });
const path = await recorder.start();
// ... user speaks ...
await recorder.stop();
console.log("Saved to:", path);
```

---

### `OpenAiWhisperProvider`

```typescript
// src/transcription/openai.ts
class OpenAiWhisperProvider implements TranscriptionProvider {
  constructor(config: PluginConfig & { prompt?: string }, log?: LogFn)
  async transcribe(audioPath: string, signal?: AbortSignal): Promise<string>
}
```

OpenAI Whisper API client with built-in validation, retry, and cancellation support.

**Constructor config:**

```typescript
{
  apiKey: string;    // required
  model: string;     // e.g. "whisper-1"
  audioDevice?: string; // unused by provider, inherited from PluginConfig shape
  prompt?: string;   // optional guidance for Whisper
}
```

**Example:**

```typescript
import { OpenAiWhisperProvider } from "./src/transcription/openai.js";

const provider = new OpenAiWhisperProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "whisper-1",
  prompt: "Use UK spelling.",
});

const text = await provider.transcribe("/tmp/recording.wav");
console.log(text); // "Refactor the auth middleware..."
```

---

## Functions

### `detectAudioTool()`

```typescript
// src/audio/recorder.ts
async function detectAudioTool(): Promise<AudioTool>
```

Detects the first available audio capture CLI tool. Priority: `ffmpeg` → `sox` → `parecord` (Linux only).

Throws if none are found.

---

### `buildArgs()`

```typescript
// src/audio/recorder.ts
function buildArgs(tool: AudioTool, outputPath: string, device?: string): string[]
```

Generates the CLI argument array for the given tool and platform. Handles platform-specific input formats (avfoundation on macOS, alsa on Linux, dshow on Windows).

**Example:**

```typescript
buildArgs("ffmpeg", "/tmp/out.wav", "default");
// → ["ffmpeg", "-y", "-f", "alsa", "-i", "default",
//    "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
//    "/tmp/out.wav"]
```

---

### `getConfig()` / `setConfig()`

```typescript
// src/settings.ts
function getConfig(kv: { get: (key: string, fallback?: unknown) => unknown }): TalkConfig
function setConfig(kv: { set: (key: string, value: unknown) => void }, patch: Partial<TalkConfig>): void
```

Read and write namespaced settings from opencode's KV store.

`getConfig` merges KV values with `DEFAULTS`. `setConfig` handles `undefined` values by resetting them to defaults.

**Example:**

```typescript
import { getConfig, setConfig } from "./src/settings.js";

const cfg = getConfig(api.kv);
console.log(cfg.model); // "whisper-1"

setConfig(api.kv, { model: "gpt-4o-transcribe" });
```

---

### `createTempFile()` / `cleanupTempFile()`

```typescript
// src/utils.ts
async function createTempFile(suffix: string): Promise<string>
async function cleanupTempFile(path: string): Promise<void>
```

Temp file primitives. `createTempFile` writes an empty file immediately so the recorder has a guaranteed path. `cleanupTempFile` is idempotent.

---

### `safeSpawn()`

```typescript
// src/utils.ts
function safeSpawn(
  command: string,
  args: string[],
  opts?: { timeout?: number; env?: ProcessEnv; cwd?: string; signal?: AbortSignal }
): Promise<{ exitCode: number | null; stdout: string; stderr: string }>
```

Spawn a child process with timeout protection, output capture, and signal propagation.

**Default timeout:** 60 seconds.

---

### `formatError()`

```typescript
// src/utils.ts
function formatError(error: unknown): string
```

Safely extract a human-readable message from any thrown value.

---

## Types & Enums

### `AudioTool`

```typescript
type AudioTool = "ffmpeg" | "sox" | "parecord";
```

Union of supported audio capture CLI tools.

---

### `ProviderName`

```typescript
type ProviderName = "openai";
```

Currently only `"openai"`. Reserved for future providers.

---

### `RecordingState`

```typescript
type RecordingState = "idle" | "recording" | "transcribing";
```

Semantic state type (unused at runtime — see [Architecture](architecture.md#state-machine)).

---

### `LogLevel`

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";
```

Structured logging severity levels.

---

## Constants

### `DEFAULTS`

```typescript
// src/settings.ts
export const DEFAULTS: TalkConfig = {
  apiKey: process.env.OPENAI_API_KEY || "",
  model: "whisper-1",
  audioDevice: undefined,
  customPrompt: "Transcribe the following audio accurately. Preserve punctuation and formatting.",
  showRecordingToast: true,
  showTranscriptionToast: true,
};
```

Default configuration values. Used when a setting has never been persisted or has been reset.

### `MAX_FILE_SIZE_BYTES`

```typescript
// src/transcription/openai.ts
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
```

OpenAI Whisper's hard file size limit. Files larger than this are rejected before upload.
