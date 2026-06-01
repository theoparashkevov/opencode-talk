const KV_PREFIX = "opencode-talk.";
const KV_KEYS = {
  apiKey: KV_PREFIX + "apiKey",
  model: KV_PREFIX + "model",
  audioDevice: KV_PREFIX + "audioDevice",
  customPrompt: KV_PREFIX + "customPrompt",
  showRecordingToast: KV_PREFIX + "showRecordingToast",
  showTranscriptionToast: KV_PREFIX + "showTranscriptionToast",
} as const;

export interface TalkConfig {
  apiKey: string;
  model: string;
  audioDevice?: string;
  customPrompt: string;
  showRecordingToast: boolean;
  showTranscriptionToast: boolean;
}

export const DEFAULTS: TalkConfig = {
  apiKey: process.env.OPENAI_API_KEY || "",
  model: "whisper-1",
  audioDevice: undefined,
  customPrompt:
    "Transcribe the following audio accurately. Preserve punctuation and formatting.",
  showRecordingToast: true,
  showTranscriptionToast: true,
};

export function getConfig(kv: { get: (key: string, fallback?: unknown) => unknown }): TalkConfig {
  return {
    apiKey: (kv.get(KV_KEYS.apiKey, DEFAULTS.apiKey) as string) || DEFAULTS.apiKey,
    model: (kv.get(KV_KEYS.model, DEFAULTS.model) as string) || DEFAULTS.model,
    audioDevice: (kv.get(KV_KEYS.audioDevice, DEFAULTS.audioDevice) as string | undefined) || DEFAULTS.audioDevice,
    customPrompt: (kv.get(KV_KEYS.customPrompt, DEFAULTS.customPrompt) as string) || DEFAULTS.customPrompt,
    showRecordingToast: kv.get(KV_KEYS.showRecordingToast, DEFAULTS.showRecordingToast) as boolean,
    showTranscriptionToast: kv.get(KV_KEYS.showTranscriptionToast, DEFAULTS.showTranscriptionToast) as boolean,
  };
}

export function setConfig(kv: { set: (key: string, value: unknown) => void }, patch: Partial<TalkConfig>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      kv.set(KV_KEYS[key as keyof typeof KV_KEYS], DEFAULTS[key as keyof TalkConfig]);
    } else {
      kv.set(KV_KEYS[key as keyof typeof KV_KEYS], value);
    }
  }
}
