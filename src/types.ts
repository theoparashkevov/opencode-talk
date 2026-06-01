import { z } from "zod";

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

export interface TranscriptionProvider {
  /**
   * Transcribe an audio file to text.
   * @param audioPath Absolute path to the audio file.
   * @param signal Optional AbortSignal for cancellation.
   * @returns The transcribed text.
   */
  transcribe(audioPath: string, signal?: AbortSignal): Promise<string>;
}

export type ProviderName = "openai";

// ---------------------------------------------------------------------------
// Audio recorder abstraction
// ---------------------------------------------------------------------------

export interface AudioRecorder {
  /** Start recording to a temporary file. Returns the temp file path. */
  start(audioDevice?: string): Promise<string>;
  /** Stop recording and finalize the file. */
  stop(): Promise<void>;
  /** Whether a recording is currently in progress. */
  isRecording(): boolean;
  /** Force-kill any running recording process. */
  cleanup(): Promise<void>;
}

/** Name of the detected external audio capture tool. */
export type AudioTool = "ffmpeg" | "sox" | "parecord";

// ---------------------------------------------------------------------------
// Plugin configuration
// ---------------------------------------------------------------------------

export const pluginConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  provider: z.enum(["openai"] as const).default("openai"),
  model: z.string().default("whisper-1"),
  audioDevice: z.string().optional(),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

// ---------------------------------------------------------------------------
// Plugin state
// ---------------------------------------------------------------------------

export type RecordingState = "idle" | "recording" | "transcribing";

export interface VoicePluginState {
  state: RecordingState;
  tempFile: string | null;
  provider: ProviderName;
  abortController: AbortController | null;
}

// ---------------------------------------------------------------------------
// Official opencode plugin context (duck-typed so the plugin works without
// @opencode-ai/plugin being present at build time).
//
// Ref: https://opencode.ai/docs/plugins
// ---------------------------------------------------------------------------

export interface OpencodeAppLogBody {
  service: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  extra?: Record<string, unknown>;
}

export interface OpencodePluginContext {
  /** Project root path */
  project: string;
  /** Working directory */
  directory: string;
  /** Current git worktree path */
  worktree: string;
  /** Bun shell API */
  $: unknown;
  /** Low-level client */
  client: {
    app: {
      /** Structured logging — official API */
      log: (payload: { body: OpencodeAppLogBody }) => void;
      /** Emit TUI events (e.g. tui.prompt.append) */
      emit?: (event: string, payload: unknown) => void;
    };
  };
}

/** Shape returned by an official opencode plugin (async default export). */
export interface OpencodePluginHooks {
  /** Custom tools exposed to the AI */
  tool?: Record<
    string,
    {
      description: string;
      args: Record<string, unknown>;
      execute: (args: Record<string, unknown>, context: OpencodePluginContext) => Promise<unknown>;
    }
  >;
  /** Event hooks */
  "server.disconnect"?: () => void | Promise<void>;
  [key: string]: unknown;
}
