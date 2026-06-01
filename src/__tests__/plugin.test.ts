import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { server } from "../server.js";
import type { OpencodePluginContext } from "../types.js";

function makeCtx(): OpencodePluginContext {
  return {
    project: "/tmp/test-project",
    directory: "/tmp/test-project",
    worktree: "/tmp/test-project",
    $: {},
    client: {
      app: {
        log: mock((_payload: { body: Record<string, unknown> }) => {}),
        emit: mock((_event: string, _payload: unknown) => {}),
      },
    },
  };
}

describe("server plugin", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OPENAI_API_KEY = "sk-test";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("exports server function returning hooks", async () => {
    const plugin = await server(makeCtx());
    expect(plugin.tool).toBeDefined();
    expect(plugin.tool!.voiceToggle).toBeDefined();
    expect(typeof plugin.tool!.voiceToggle.execute).toBe("function");
    expect(plugin["server.disconnect"]).toBeDefined();
  });

  it("voiceToggle starts recording when idle", async () => {
    mock.module("openai", () => ({
      OpenAI: class MockOpenAI {
        audio = {
          transcriptions: {
            create: mock(async () => ({ text: "cleanup" })),
          },
        };
      },
    }));

    const ctx = makeCtx();
    const plugin = await server(ctx);
    const result = await plugin.tool!.voiceToggle.execute({}, ctx);
    expect(typeof result).toBe("string");
    expect(result).toContain("Recording started");

    // Clean up
    await plugin.tool!.voiceToggle.execute({}, ctx);
    await (plugin["server.disconnect"] as () => Promise<void>)?.();
  });

  it("voiceToggle stops and transcribes when recording", async () => {
    mock.module("openai", () => ({
      OpenAI: class MockOpenAI {
        audio = {
          transcriptions: {
            create: mock(async () => ({ text: "Test transcription" })),
          },
        };
      },
    }));

    const ctx = makeCtx();
    const plugin = await server(ctx);

    // Start
    await plugin.tool!.voiceToggle.execute({}, ctx);

    const result = await plugin.tool!.voiceToggle.execute({}, ctx);
    expect(result).toBe("Test transcription");
    await (plugin["server.disconnect"] as () => Promise<void>)?.();
  }, 15_000);

  it("server.disconnect cleans up recording state", async () => {
    const ctx = makeCtx();
    const plugin = await server(ctx);
    await plugin.tool!.voiceToggle.execute({}, ctx);
    await expect(
      (plugin["server.disconnect"] as () => Promise<void>)?.()
    ).resolves.toBeUndefined();
  });

  it("cancels transcription when toggled during transcribing", async () => {
    mock.module("openai", () => ({
      OpenAI: class MockOpenAI {
        audio = {
          transcriptions: {
            create: mock(async (_params: unknown, opts?: { signal?: AbortSignal }) => {
              return new Promise((resolve, reject) => {
                const timer = setTimeout(() => resolve({ text: "should not reach" }), 5_000);
                opts?.signal?.addEventListener("abort", () => {
                  clearTimeout(timer);
                  reject(new Error("Request was aborted."));
                });
              });
            }),
          },
        };
      },
    }));

    const ctx = makeCtx();
    const plugin = await server(ctx);

    // Start recording
    await plugin.tool!.voiceToggle.execute({}, ctx);

    // Fire stop + transcribe
    const transcribePromise = plugin.tool!.voiceToggle.execute({}, ctx);

    // Immediately cancel while transcribing
    await new Promise((resolve) => setTimeout(resolve, 100));
    const cancelResult = await plugin.tool!.voiceToggle.execute({}, ctx);
    expect(cancelResult).toBe("(cancelled)");

    // The original transcribe should also resolve to cancelled
    const transcribeResult = await transcribePromise;
    expect(transcribeResult).toBe("(cancelled)");

    await (plugin["server.disconnect"] as () => Promise<void>)?.();
  }, 10_000);

  it("server.disconnect while transcribing aborts and cleans up", async () => {
    mock.module("openai", () => ({
      OpenAI: class MockOpenAI {
        audio = {
          transcriptions: {
            create: mock(async (_params: unknown, opts?: { signal?: AbortSignal }) => {
              return new Promise((resolve, reject) => {
                const timer = setTimeout(() => resolve({ text: "should not reach" }), 5_000);
                opts?.signal?.addEventListener("abort", () => {
                  clearTimeout(timer);
                  reject(new Error("Request was aborted."));
                });
              });
            }),
          },
        };
      },
    }));

    const ctx = makeCtx();
    const plugin = await server(ctx);

    await plugin.tool!.voiceToggle.execute({}, ctx);
    const transcribePromise = plugin.tool!.voiceToggle.execute({}, ctx);

    // Unload while transcribing
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(
      (plugin["server.disconnect"] as () => Promise<void>)?.()
    ).resolves.toBeUndefined();

    // The transcription should resolve to cancelled after abort
    const result = await transcribePromise;
    expect(result).toBe("(cancelled)");
  }, 10_000);
});
