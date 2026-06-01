import { platform } from "node:os";
import { AudioRecorder, AudioTool } from "../types.js";
import { safeSpawn, createTempFile, cleanupTempFile, formatError } from "../utils.js";
import type { LogLevel } from "../utils.js";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Tool detection
// ---------------------------------------------------------------------------

async function toolExists(name: string): Promise<boolean> {
  try {
    await safeSpawn("which", [name], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the first available audio capture tool.
 * Priority: ffmpeg → sox → parecord (Linux).
 */
export async function detectAudioTool(): Promise<AudioTool> {
  const tools: AudioTool[] = ["ffmpeg", "sox"];
  if (platform() === "linux") tools.push("parecord");

  for (const tool of tools) {
    if (await toolExists(tool)) {
      return tool;
    }
  }

  throw new Error(
    "No audio capture tool found. Install one of: ffmpeg (recommended), sox, or parecord (Linux). See README for installation instructions."
  );
}

// ---------------------------------------------------------------------------
// Recorder implementation
// ---------------------------------------------------------------------------

export interface FfmpegRecorderOptions {
  /** Preferred tool override. If omitted, auto-detected. */
  tool?: AudioTool;
  /** Optional audio device name. */
  audioDevice?: string;
}

export class FfmpegRecorder implements AudioRecorder {
  private child: ChildProcess | null = null;
  private tempFile: string | null = null;
  private _tool: AudioTool | null = null;
  private _audioDevice?: string;
  private _log: (level: LogLevel, message: string, extra?: Record<string, unknown>) => void;

  constructor(
    opts: FfmpegRecorderOptions = {},
    log: (level: LogLevel, message: string, extra?: Record<string, unknown>) => void = () => {}
  ) {
    this._tool = opts.tool ?? null;
    this._audioDevice = opts.audioDevice;
    this._log = log;
  }

  async start(audioDevice?: string): Promise<string> {
    if (this.child) {
      throw new Error("Already recording. Call stop() before starting a new recording.");
    }

    const tool = this._tool ?? (await detectAudioTool());
    this._tool = tool;

    const device = audioDevice ?? this._audioDevice;
    const tempFile = await createTempFile(".wav");
    this.tempFile = tempFile;

    const args = buildArgs(tool, tempFile, device);
    this._log("info", "Starting audio recording", { tool, tempFile, device });

    this.child = spawn(args[0], args.slice(1), {
      detached: false,
      env: process.env,
    });

    this.child.on("error", (err) => {
      this._log("error", "Recorder process error", { error: formatError(err) });
    });

    // Give the process a moment to fail early (e.g. bad device)
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, 500);

      this.child!.on("exit", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`Recorder exited immediately with code ${code}. Check audio device permissions.`));
        }
      });
      this.child!.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
    });

    return this.tempFile;
  }

  async stop(): Promise<void> {
    if (!this.child) {
      throw new Error("Not currently recording.");
    }

    this._log("info", "Stopping audio recording");

    const child = this.child;
    this.child = null;

    const exited = new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
      child.on("error", () => resolve());
      // Safety fallback
      setTimeout(() => resolve(), 3_000);
    });

    child.kill("SIGTERM");
    await exited;

    // Hard kill only if process is still alive
    if (!child.killed && child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore — process may have exited between check and kill
      }
    }
  }

  isRecording(): boolean {
    return this.child !== null && !this.child.killed;
  }

  async cleanup(): Promise<void> {
    if (this.child && !this.child.killed) {
      try {
        this.child.kill("SIGTERM");
      } catch {
        // ignore
      }

      await new Promise<void>((resolve) => {
        const child = this.child;
        if (!child || child.killed) {
          resolve();
          return;
        }
        child.on("exit", () => resolve());
        child.on("error", () => resolve());
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
          resolve();
        }, 1_500);
      });
    }
    this.child = null;
    if (this.tempFile) {
      await cleanupTempFile(this.tempFile);
      this.tempFile = null;
    }
  }

  getTempFile(): string | null {
    return this.tempFile;
  }
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

export function buildArgs(tool: AudioTool, outputPath: string, device?: string): string[] {
  const pf = platform();

  switch (tool) {
    case "ffmpeg": {
      const fmt = pf === "darwin" ? "avfoundation" : pf === "win32" ? "dshow" : "alsa";
      const input = device ?? (pf === "darwin" ? ":0" : "default");
      return [
        "ffmpeg",
        "-y", // overwrite
        "-f", fmt,
        "-i", input,
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        outputPath,
      ];
    }
    case "sox": {
      const input = device ?? "-d"; // -d = default device
      return ["sox", input, outputPath];
    }
    case "parecord": {
      const args = ["parecord", outputPath];
      if (device) args.push("-d", device);
      return args;
    }
    default: {
      throw new Error(`Unsupported audio tool: ${tool satisfies never}`);
    }
  }
}
