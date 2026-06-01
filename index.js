import { FfmpegRecorder } from "./src/audio/recorder.js";
import { OpenAiWhisperProvider } from "./src/transcription/openai.js";
import { cleanupTempFile } from "./src/utils.js";
import { getConfig, setConfig, DEFAULTS } from "./src/settings.js";

const noop = () => {};

const plugin = {
  id: "opencode-talk",
  tui: async (api) => {
    const kv = api.kv;
    const toast = api.ui.toast;

    // Lazy-initialised recorder + provider (re-created when config changes)
    let recorder = null;
    let provider = null;
    let recordingIndicator = null;

    function startRecordingIndicator() {
      const cfg = getConfig(kv);
      if (!cfg.showRecordingToast) return;

      let dotCount = 0;
      const dots = ["·  ", "·· ", "···"];

      // Show first frame immediately
      toast({ variant: "info", title: "🎤 Recording", message: "Listening " + dots[0], duration: 60_000 });

      // Animate dots every 500ms
      recordingIndicator = setInterval(() => {
        dotCount = (dotCount + 1) % dots.length;
        toast({ variant: "info", title: "🎤 Recording", message: "Listening " + dots[dotCount], duration: 60_000 });
      }, 500);
    }

    function stopRecordingIndicator() {
      if (recordingIndicator) {
        clearInterval(recordingIndicator);
        recordingIndicator = null;
      }
    }

    function getRecorder() {
      const cfg = getConfig(kv);
      if (!recorder) {
        recorder = new FfmpegRecorder({ audioDevice: cfg.audioDevice }, noop);
      }
      return recorder;
    }

    function getProvider() {
      const cfg = getConfig(kv);
      if (!provider) {
        provider = new OpenAiWhisperProvider(
          {
            apiKey: cfg.apiKey,
            model: cfg.model,
            audioDevice: cfg.audioDevice,
            prompt: cfg.customPrompt,
          },
          noop
        );
      }
      return provider;
    }

    function resetInstances() {
      recorder?.cleanup?.().catch(noop);
      recorder = null;
      provider = null;
    }

    // ------------------------------------------------------------------
    // /voice  –  toggle recording
    // ------------------------------------------------------------------
    api.command.register(() => [
      {
        title: "Toggle Voice Recording",
        value: "voiceToggle",
        description: "Start or stop voice recording and transcribe with Whisper",
        category: "Voice",
        keybind: "<leader>v",
        slash: { name: "voice", aliases: ["mic", "talk"] },
        suggested: true,
        onSelect: async () => {
          const rec = getRecorder();
          try {
            if (!rec.isRecording()) {
              await rec.start();
              startRecordingIndicator();
              return;
            }

            stopRecordingIndicator();
            await rec.stop();
            toast({
              variant: "info",
              title: "⏳ Transcribing",
              message: "Sending audio to Whisper…",
              duration: 3000,
            });

            const tempFile = rec.getTempFile();
            if (!tempFile) {
              toast({ variant: "error", title: "❌ Error", message: "No audio captured.", duration: 4000 });
              return;
            }

            const prov = getProvider();
            const text = await prov.transcribe(tempFile);
            await cleanupTempFile(tempFile);
            await api.client.tui.appendPrompt({ text });

            const cfg = getConfig(kv);
            if (cfg.showTranscriptionToast) {
              toast({
                variant: "success",
                title: "✅ Transcription Done",
                message: text.slice(0, 60) + (text.length > 60 ? "…" : ""),
                duration: 3000,
              });
            }
          } catch (err) {
            stopRecordingIndicator();
            toast({
              variant: "error",
              title: "❌ Voice Error",
              message: String(err),
              duration: 5000,
            });
          }
        },
      },

      // ----------------------------------------------------------------
      // /voice-config  –  settings menu
      // ----------------------------------------------------------------
      {
        title: "Voice Settings",
        value: "voiceConfig",
        description: "Configure API key, model, audio device and prompt",
        category: "Voice",
        slash: { name: "voice-config", aliases: ["talk-config", "vconf"] },
        onSelect: () => openSettingsMenu(kv, toast, resetInstances),
      },
    ]);

    function openSettingsMenu(kv, toast, onChange) {
      const cfg = getConfig(kv);

      api.ui.dialog.replace(() =>
        api.ui.DialogSelect({
          title: "Voice Settings",
          current: null,
          options: [
            {
              title: `API Key    ${cfg.apiKey ? "(set)" : "(not set)"}`,
              value: "apiKey",
              onSelect: () => {
                api.ui.dialog.replace(() =>
                  api.ui.DialogPrompt({
                    title: "OpenAI API Key",
                    placeholder: "sk-…",
                    value: cfg.apiKey,
                    onConfirm: (value) => {
                      setConfig(kv, { apiKey: value.trim() || undefined });
                      onChange();
                      toast({ variant: "success", title: "Saved", message: "API key updated.", duration: 2000 });
                      api.ui.dialog.clear();
                    },
                    onCancel: () => api.ui.dialog.clear(),
                  })
                );
              },
            },
            {
              title: `Audio Device    ${cfg.audioDevice || "(default)"}`,
              value: "audioDevice",
              onSelect: () => {
                api.ui.dialog.replace(() =>
                  api.ui.DialogPrompt({
                    title: "Audio Device",
                    placeholder: "Leave empty for system default",
                    value: cfg.audioDevice || "",
                    onConfirm: (value) => {
                      setConfig(kv, { audioDevice: value.trim() || undefined });
                      onChange();
                      toast({ variant: "success", title: "Saved", message: "Audio device updated.", duration: 2000 });
                      api.ui.dialog.clear();
                    },
                    onCancel: () => api.ui.dialog.clear(),
                  })
                );
              },
            },
            {
              title: `Model    ${cfg.model}`,
              value: "model",
              onSelect: () => {
                const models = ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"];
                api.ui.dialog.replace(() =>
                  api.ui.DialogSelect({
                    title: "Select Model",
                    current: cfg.model,
                    options: models.map((m) => ({
                      title: m,
                      value: m,
                      onSelect: () => {
                        setConfig(kv, { model: m });
                        onChange();
                        toast({ variant: "success", title: "Saved", message: `Model: ${m}`, duration: 2000 });
                        api.ui.dialog.clear();
                      },
                    })),
                  })
                );
              },
            },
            {
              title: `Custom Prompt    ${cfg.customPrompt ? "(set)" : "(default)"}`,
              value: "customPrompt",
              onSelect: () => {
                api.ui.dialog.replace(() =>
                  api.ui.DialogPrompt({
                    title: "Transcription Prompt",
                    placeholder: DEFAULTS.customPrompt,
                    value: cfg.customPrompt,
                    onConfirm: (value) => {
                      setConfig(kv, { customPrompt: value.trim() || undefined });
                      toast({ variant: "success", title: "Saved", message: "Prompt updated.", duration: 2000 });
                      api.ui.dialog.clear();
                    },
                    onCancel: () => api.ui.dialog.clear(),
                  })
                );
              },
            },
            {
              title: `Show Recording Indicator    ${cfg.showRecordingToast ? "(on)" : "(off)"}`,
              value: "showRecordingToast",
              description: "Toggle animated dots while recording",
              onSelect: () => {
                const next = !cfg.showRecordingToast;
                setConfig(kv, { showRecordingToast: next });
                toast({ variant: "success", title: "Saved", message: `Recording indicator: ${next ? "on" : "off"}`, duration: 2000 });
                api.ui.dialog.clear();
              },
            },
            {
              title: `Show Transcription Toast    ${cfg.showTranscriptionToast ? "(on)" : "(off)"}`,
              value: "showTranscriptionToast",
              description: "Toggle success toast after transcription",
              onSelect: () => {
                const next = !cfg.showTranscriptionToast;
                setConfig(kv, { showTranscriptionToast: next });
                toast({ variant: "success", title: "Saved", message: `Transcription toast: ${next ? "on" : "off"}`, duration: 2000 });
                api.ui.dialog.clear();
              },
            },
            {
              title: "Reset to Defaults",
              value: "reset",
              description: "Clear all stored settings and revert to defaults",
              onSelect: () => {
                api.ui.dialog.replace(() =>
                  api.ui.DialogConfirm({
                    title: "Reset Settings?",
                    message: "This will clear your API key, model, device and prompt preferences.",
                    onConfirm: () => {
                      setConfig(kv, { apiKey: undefined, model: undefined, audioDevice: undefined, customPrompt: undefined, showRecordingToast: undefined, showTranscriptionToast: undefined });
                      onChange();
                      toast({ variant: "success", title: "Reset", message: "Settings restored to defaults.", duration: 2000 });
                      api.ui.dialog.clear();
                    },
                    onCancel: () => api.ui.dialog.clear(),
                  })
                );
              },
            },
            {
              title: "Close",
              value: "close",
              onSelect: () => api.ui.dialog.clear(),
            },
          ],
        })
      );
    }
  },
};

export const id = plugin.id;
export const tui = plugin.tui;
export default plugin;
