import { OpenAI } from "openai";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { TranscriptionProvider, type PluginConfig } from "../types.js";
import { formatError } from "../utils.js";
import type { LogLevel } from "../utils.js";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB OpenAI limit

export class OpenAiWhisperProvider implements TranscriptionProvider {
  private client: OpenAI;
  private model: string;
  private prompt?: string;
  private _log: (level: LogLevel, message: string, extra?: Record<string, unknown>) => void;

  constructor(
    config: PluginConfig & { prompt?: string },
    log: (level: LogLevel, message: string, extra?: Record<string, unknown>) => void = () => {}
  ) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.prompt = config.prompt;
    this._log = log;
  }

  async transcribe(audioPath: string, signal?: AbortSignal): Promise<string> {
    // Validate file exists and is under size limit
    const info = await stat(audioPath);
    if (info.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Audio file is ${(info.size / 1024 / 1024).toFixed(1)}MB, exceeds OpenAI's 25MB limit.`
      );
    }
    if (info.size === 0) {
      throw new Error("Audio file is empty. Ensure your microphone is working and try again.");
    }

    this._log("info", "Sending audio to OpenAI Whisper", { model: this.model, sizeBytes: info.size });

    let lastError: Error | undefined;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        throw new Error("Transcription cancelled by user.");
      }

      try {
        const fileStream = createReadStream(audioPath);
        const result = await this.client.audio.transcriptions.create(
          {
            file: fileStream as unknown as File,
            model: this.model,
            ...(this.prompt ? { prompt: this.prompt } : {}),
          },
          { signal }
        );

        this._log("info", "Transcription complete", { length: result.text.length });
        return result.text;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(formatError(err));

        const status = (err as { status?: number }).status;

        if (signal?.aborted) {
          throw new Error("Transcription cancelled by user.");
        }

        if (status === 401) {
          throw new Error("Invalid OpenAI API key. Check your OPENAI_API_KEY or configuration.");
        }
        if (status === 429) {
          if (attempt < maxRetries) {
            const delay = Math.min(2 ** attempt * 1_000, 8_000);
            this._log("warn", "OpenAI rate limited, retrying...", { attempt, delayMs: delay });
            await sleep(delay);
            continue;
          }
          throw new Error("OpenAI rate limit exceeded. Please wait a moment and try again.");
        }

        // For other errors, retry only on network-ish issues
        const isNetworkError = lastError.message.includes("fetch") || lastError.message.includes("ECONNREFUSED");
        if (isNetworkError && attempt < maxRetries) {
          const delay = Math.min(2 ** attempt * 1_000, 8_000);
          this._log("warn", "Network error during transcription, retrying...", { attempt, delayMs: delay });
          await sleep(delay);
          continue;
        }

        // Non-retryable or final attempt
        throw new Error(`Transcription failed: ${lastError.message}`);
      }
    }

    // Should never reach here
    throw lastError ?? new Error("Transcription failed after retries.");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
