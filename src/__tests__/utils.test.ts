import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createTempFile,
  cleanupTempFile,
  safeSpawn,
  log,
  setLogAdapter,
  createLogAdapter,
  formatError,
} from "../utils.js";
import { access } from "node:fs/promises";

describe("createTempFile + cleanupTempFile", () => {
  it("creates a temp file with the requested suffix", async () => {
    const path = await createTempFile(".wav");
    expect(path.endsWith(".wav")).toBe(true);
    await access(path);
    await cleanupTempFile(path);
    await expect(access(path)).rejects.toBeDefined();
  });

  it("cleanupTempFile is a no-op when file is missing", async () => {
    await expect(cleanupTempFile("/tmp/opencode-talk-nonexistent-12345.wav")).resolves.toBeUndefined();
  });
});

describe("createLogAdapter", () => {
  it("calls client.app.log with official payload shape", () => {
    const logs: Array<Record<string, unknown>> = [];
    const ctx = {
      project: "",
      directory: "",
      worktree: "",
      $: {},
      client: {
        app: {
          log: (payload: { body: Record<string, unknown> }) => {
            logs.push(payload.body);
          },
        },
      },
    };

    const adapter = createLogAdapter(ctx as any);
    adapter("info", "hello", { foo: "bar" });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      service: "opencode-talk",
      level: "info",
      message: "hello",
      extra: { foo: "bar" },
    });
  });
});

describe("setLogAdapter", () => {
  it("uses custom adapter when set", () => {
    const messages: Array<{ level: string; message: string }> = [];
    setLogAdapter((level, message) => {
      messages.push({ level, message });
    });
    log("info", "hello");
    expect(messages).toHaveLength(1);
    expect(messages[0].level).toBe("info");
    expect(messages[0].message).toBe("hello");
  });
});

describe("formatError", () => {
  it("returns message for Error instances", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
  });

  it("returns string for primitives", () => {
    expect(formatError("raw string")).toBe("raw string");
    expect(formatError(42)).toBe("42");
  });
});

describe("safeSpawn", () => {
  it("runs a command and captures stdout", async () => {
    const result = await safeSpawn("echo", ["hello"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
  });

  it("respects timeout and kills long-running process", async () => {
    const start = Date.now();
    await expect(safeSpawn("sleep", ["10"], { timeout: 200 })).rejects.toThrow(/timed out/);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2_000);
  });
});