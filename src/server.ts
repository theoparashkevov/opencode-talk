import type { PluginConfig, VoicePluginState } from "./types.js";
import { resolveConfig } from "./config.js";
import { FfmpegRecorder } from "./audio/recorder.js";
import { OpenAiWhisperProvider } from "./transcription/openai.js";
import { cleanupTempFile, createLogAdapter } from "./utils.js";

/**
 * Server plugin — registers the voiceToggle AI tool.
 */
export const server = async (ctx: {
  project: string;
  directory: string;
  worktree: string;
  $: unknown;
  client: {
    app: {
      log: (payload: { body: Record<string, unknown> }) => void;
      emit?: (event: string, payload: unknown) => void;
    };
  };
}) => {
  // Import tool helper at runtime from opencode's config node_modules.
  let tool: any;
  try {
    const plugin = await import("@opencode-ai/plugin");
    tool = plugin.tool;
  } catch {
    tool = (input: unknown) => input;
  }

  const config: PluginConfig = resolveConfig({});
  const log = createLogAdapter(ctx);

  const recorder = new FfmpegRecorder({ audioDevice: config.audioDevice });
  const provider = new OpenAiWhisperProvider(config);

  const state: VoicePluginState = {
    state: "idle",
    tempFile: null,
    provider: config.provider,
    abortController: null,
  };

  async function doToggle(): Promise<string> {
    if (state.state === "recording") {
      state.state = "transcribing";
      try {
        await recorder.stop();

        const tempFile = recorder.getTempFile();
        if (!tempFile) {
          throw new Error("Recording stopped but no temp file was created.");
        }
        state.tempFile = tempFile;

        const ac = new AbortController();
        state.abortController = ac;

        let text: string;
        try {
          text = await provider.transcribe(tempFile, ac.signal);
        } catch (err) {
          if (ac.signal.aborted) {
            log("info", "Transcription cancelled by user");
            return "(cancelled)";
          }
          throw err;
        } finally {
          state.abortController = null;
          await cleanupTempFile(tempFile);
          state.tempFile = null;
        }

        log("info", "Voice transcription complete", { textLength: text.length });
        state.state = "idle";
        return text;
      } catch (err) {
        state.state = "idle";
        if (state.tempFile) {
          await cleanupTempFile(state.tempFile);
          state.tempFile = null;
        }
        throw err;
      }
    }

    if (state.state === "transcribing") {
      state.abortController?.abort();
      state.state = "idle";
      const tempFile = recorder.getTempFile();
      if (tempFile) {
        await cleanupTempFile(tempFile);
      }
      log("info", "Transcription cancelled, state reset to idle");
      return "(cancelled)";
    }

    state.state = "recording";
    try {
      const path = await recorder.start();
      state.tempFile = path;
      log("info", "Recording started", { tempFile: path });
      return "Recording started... Speak now, then toggle again to stop.";
    } catch (err) {
      state.state = "idle";
      throw err;
    }
  }

  async function onDisconnect(): Promise<void> {
    if (state.state === "recording") {
      log("warn", "Plugin unloading while recording — forcing stop");
      try {
        await recorder.stop();
      } catch {
        // ignore
      }
    }
    state.abortController?.abort();
    await recorder.cleanup();
    log("info", "Plugin unloaded, resources cleaned up");
  }

  return {
    tool: {
      voiceToggle: tool({
        description:
          "Toggle voice recording. First call starts recording, second call stops and transcribes the audio using OpenAI Whisper.",
        args: {},
        execute: async (_args: Record<string, unknown>, _context: Record<string, unknown>) => doToggle(),
      }),
    },
    "server.disconnect": onDisconnect,
  };
};
