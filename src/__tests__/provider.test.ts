import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { OpenAiWhisperProvider } from "../transcription/openai.js";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("OpenAiWhisperProvider", () => {
  let tempFile: string;

  beforeEach(async () => {
    tempFile = join(tmpdir(), `opencode-talk-test-${Date.now()}.wav`);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(16000, 24);
    header.writeUInt32LE(32000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(0, 40);
    await writeFile(tempFile, header);
  });

  afterEach(async () => {
    try {
      await unlink(tempFile);
    } catch {
      // ignore
    }
  });

  it("throws on auth failure (401)", async () => {
    mock.module("openai", () => ({
      OpenAI: class MockOpenAI {
        audio = {
          transcriptions: {
            create: mock(async () => {
              const err = new Error("Invalid API key") as Error & { status?: number };
              err.status = 401;
              throw err;
            }),
          },
        };
      },
    }));

    const provider = new OpenAiWhisperProvider({
      apiKey: "sk-invalid",
      provider: "openai",
      model: "whisper-1",
    });

    await expect(provider.transcribe(tempFile)).rejects.toThrow(/Invalid OpenAI API key/);
  });

  it("throws on file size > 25MB", async () => {
    const bigFile = join(tmpdir(), `opencode-talk-big-${Date.now()}.wav`);
    const bigBuf = Buffer.alloc(26 * 1024 * 1024);
    await writeFile(bigFile, bigBuf);

    const provider = new OpenAiWhisperProvider({
      apiKey: "sk-test",
      provider: "openai",
      model: "whisper-1",
    });

    try {
      await expect(provider.transcribe(bigFile)).rejects.toThrow(/exceeds OpenAI's 25MB limit/);
    } finally {
      await unlink(bigFile);
    }
  });

  it("throws on empty audio file", async () => {
    const emptyFile = join(tmpdir(), `opencode-talk-empty-${Date.now()}.wav`);
    await writeFile(emptyFile, Buffer.alloc(0));

    const provider = new OpenAiWhisperProvider({
      apiKey: "sk-test",
      provider: "openai",
      model: "whisper-1",
    });

    try {
      await expect(provider.transcribe(emptyFile)).rejects.toThrow(/Audio file is empty/);
    } finally {
      await unlink(emptyFile);
    }
  });

  it("returns transcription text on success (mocked)", async () => {
    mock.module("openai", () => ({
      OpenAI: class MockOpenAI {
        audio = {
          transcriptions: {
            create: mock(async () => ({ text: "Hello world" })),
          },
        };
      },
    }));

    const provider = new OpenAiWhisperProvider({
      apiKey: "sk-test",
      provider: "openai",
      model: "whisper-1",
    });

    const text = await provider.transcribe(tempFile);
    expect(text).toBe("Hello world");
  });

  it("retries on 429 and eventually succeeds", async () => {
    let calls = 0;
    mock.module("openai", () => ({
      OpenAI: class MockOpenAI {
        audio = {
          transcriptions: {
            create: mock(async () => {
              calls++;
              if (calls < 3) {
                const err = new Error("Rate limited") as Error & { status?: number };
                err.status = 429;
                throw err;
              }
              return { text: "Retried success" };
            }),
          },
        };
      },
    }));

    const provider = new OpenAiWhisperProvider({
      apiKey: "sk-test",
      provider: "openai",
      model: "whisper-1",
    });

    const text = await provider.transcribe(tempFile);
    expect(text).toBe("Retried success");
    expect(calls).toBe(3);
  }, 15_000);
});
