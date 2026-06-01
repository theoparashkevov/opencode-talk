import { pluginConfigSchema, type PluginConfig } from "./types.js";
import { log } from "./utils.js";

const ENV_KEY_CANDIDATES = ["OPENAI_API_KEY", "OPENAI_KEY"];

export function resolveConfig(input: Record<string, unknown> = {}): PluginConfig {
  const cloned = { ...input };

  // Resolve API key from env if not explicitly provided
  if (!cloned.apiKey || typeof cloned.apiKey !== "string" || cloned.apiKey.trim().length === 0) {
    for (const key of ENV_KEY_CANDIDATES) {
      const envVal = process.env[key];
      if (envVal && envVal.trim().length > 0) {
        cloned.apiKey = envVal.trim();
        log("debug", "Resolved API key from environment variable", { envVar: key });
        break;
      }
    }
  }

  const parsed = pluginConfigSchema.safeParse(cloned);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    log("error", "Configuration validation failed", { issues });
    throw new Error(`Invalid opencode-talk configuration — ${issues}`);
  }

  return parsed.data;
}

export const defaultConfig: PluginConfig = {
  apiKey: "",
  provider: "openai",
  model: "whisper-1",
  audioDevice: undefined,
};
