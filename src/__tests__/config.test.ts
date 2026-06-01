import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { resolveConfig, defaultConfig } from "../config.js";

describe("resolveConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolves API key from OPENAI_API_KEY env var", () => {
    process.env.OPENAI_API_KEY = "sk-env";
    const cfg = resolveConfig({});
    expect(cfg.apiKey).toBe("sk-env");
    expect(cfg.provider).toBe("openai");
    expect(cfg.model).toBe("whisper-1");
  });

  it("resolves API key from OPENAI_KEY env var as fallback", () => {
    process.env.OPENAI_KEY = "sk-fallback";
    const cfg = resolveConfig({});
    expect(cfg.apiKey).toBe("sk-fallback");
  });

  it("prefers explicit apiKey over env var", () => {
    process.env.OPENAI_API_KEY = "sk-env";
    const cfg = resolveConfig({ apiKey: "sk-explicit" });
    expect(cfg.apiKey).toBe("sk-explicit");
  });

  it("uses explicit model override", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const cfg = resolveConfig({ model: "whisper-large-v3" });
    expect(cfg.model).toBe("whisper-large-v3");
  });

  it("throws when API key is missing", () => {
    expect(() => resolveConfig({})).toThrow(/API key is required|Invalid opencode-talk configuration/);
  });

  it("throws on empty apiKey string", () => {
    expect(() => resolveConfig({ apiKey: "" })).toThrow(/API key is required|Invalid opencode-talk configuration/);
  });
});

describe("defaultConfig", () => {
  it("has expected defaults", () => {
    expect(defaultConfig.provider).toBe("openai");
    expect(defaultConfig.model).toBe("whisper-1");
    expect(defaultConfig.audioDevice).toBeUndefined();
  });
});
