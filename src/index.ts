import { resolveConfig } from "./config.js";
import { FfmpegRecorder } from "./audio/recorder.js";
import { OpenAiWhisperProvider } from "./transcription/openai.js";
import { cleanupTempFile, createLogAdapter } from "./utils.js";
import type { PluginConfig, VoicePluginState } from "./types.js";

// No-op logger for contexts without structured logging
const noopLogger = () => {};

// ============================================================================
// Server Plugin — AI-facing tool
// ============================================================================

export const opencodeTalk = async (ctx: {
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
  // Falls back to identity if unavailable (e.g. in tests).
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
      // Stop -> transcribe
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
      // Cancel ongoing transcription and reset to idle
      state.abortController?.abort();
      state.state = "idle";
      const tempFile = recorder.getTempFile();
      if (tempFile) {
        await cleanupTempFile(tempFile);
      }
      log("info", "Transcription cancelled, state reset to idle");
      return "(cancelled)";
    }

    // idle -> start recording
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

// ============================================================================
// TUI Plugin — User-facing slash command
// ============================================================================

export const tui = async (api: any) => {
  const config: PluginConfig = resolveConfig({});
  const recorder = new FfmpegRecorder({ audioDevice: config.audioDevice }, noopLogger as any);
  const provider = new OpenAiWhisperProvider(config, noopLogger as any);

  let isRecording = false;

  api.command.register(() => [
    {
      title: "Toggle Voice Recording",
      value: "voiceToggle",
      description: "Start or stop voice recording and transcribe with Whisper",
      category: "Voice",
      slash: { name: "voice", aliases: ["v", "record"] },
      suggested: true,
      onSelect: () => {
        handleToggle(api, recorder, provider, () => isRecording, (val) => { isRecording = val; }).catch(
          (err) => {
            api.ui.toast({
              variant: "error",
              title: "Voice Error",
              message: String(err),
              duration: 5000,
            });
          }
        );
      },
    },
  ]);
};

async function handleToggle(
  api: any,
  recorder: FfmpegRecorder,
  provider: OpenAiWhisperProvider,
  getIsRecording: () => boolean,
  setIsRecording: (val: boolean) => void
) {
  if (!getIsRecording()) {
    setIsRecording(true);
    await recorder.start();
    api.ui.toast({
      variant: "info",
      title: "Recording",
      message: "Speak now. Press /voice again to stop.",
      duration: 3000,
    });
    return;
  }

  setIsRecording(false);
  await recorder.stop();
  api.ui.toast({
    variant: "info",
    title: "Transcribing",
    message: "Sending audio to Whisper...",
    duration: 2000,
  });

  const tempFile = recorder.getTempFile();
  if (!tempFile) {
    api.ui.toast({
      variant: "error",
      title: "Recording Error",
      message: "No audio file was captured.",
      duration: 5000,
    });
    return;
  }

  try {
    const text = await provider.transcribe(tempFile);
    await cleanupTempFile(tempFile);

    // Inject transcribed text into the TUI prompt
    await api.client.appendPrompt({ text });

    api.ui.toast({
      variant: "success",
      title: "Transcription Done",
      message: text.slice(0, 60) + (text.length > 60 ? "..." : ""),
      duration: 3000,
    });
  } catch (err) {
    await cleanupTempFile(tempFile);
    throw err;
  }
}
