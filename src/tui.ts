import { resolveConfig } from "./config.js";
import { FfmpegRecorder } from "./audio/recorder.js";
import { OpenAiWhisperProvider } from "./transcription/openai.js";
import { cleanupTempFile } from "./utils.js";

const noopLogger = () => {};

export const tui = async (api: any) => {
  const config = resolveConfig({});
  const recorder = new FfmpegRecorder({ audioDevice: config.audioDevice }, noopLogger as any);
  const provider = new OpenAiWhisperProvider(config, noopLogger as any);

  let isRecording = false;

  // Register slash command
  api.command.register(() => [
    {
      title: "Toggle Voice Recording",
      value: "voiceToggle",
      description: "Start or stop voice recording and transcribe with Whisper",
      category: "Voice",
      keybind: "ctrl+v",
      slash: { name: "voice", aliases: ["v"] },
      suggested: true,
      onSelect: () => {
        handleToggle(api, recorder, provider).catch((err: unknown) => {
          api.ui.toast({
            variant: "error",
            title: "Voice Error",
            message: String(err),
            duration: 5000,
          });
        });
      },
    },
  ]);
};

async function handleToggle(api: any, recorder: FfmpegRecorder, provider: OpenAiWhisperProvider) {
  const toast = (variant: string, title: string, message: string) =>
    api.ui.toast({ variant, title, message, duration: 3000 });

  if (!recorder.isRecording()) {
    await recorder.start();
    toast("info", "Recording", "Speak now. Run /voice again to stop.");
    return;
  }

  await recorder.stop();
  toast("info", "Transcribing", "Sending audio to Whisper...");

  const tempFile = recorder.getTempFile();
  if (!tempFile) {
    toast("error", "Recording Error", "No audio file was captured.");
    return;
  }

  try {
    const text = await provider.transcribe(tempFile);
    await cleanupTempFile(tempFile);

    // Inject text into TUI prompt
    await api.client.appendPrompt({ text });
    toast("success", "Transcription Done", text.slice(0, 60) + (text.length > 60 ? "..." : ""));
  } catch (err) {
    await cleanupTempFile(tempFile);
    toast("error", "Transcription Failed", String(err));
  }
}
