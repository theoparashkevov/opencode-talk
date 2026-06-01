import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { FfmpegRecorder, detectAudioTool, buildArgs } from "../audio/recorder.js";
import { safeSpawn } from "../utils.js";

describe("detectAudioTool", () => {
  it("detects ffmpeg when available", async () => {
    const tool = await detectAudioTool();
    expect(tool).toBe("ffmpeg");
  });
});

describe("FfmpegRecorder", () => {
  let recorder: FfmpegRecorder;

  beforeEach(() => {
    recorder = new FfmpegRecorder();
  });

  afterEach(async () => {
    await recorder.cleanup();
  });

  it("starts and stops recording with ffmpeg", async () => {
    const path = await recorder.start();
    expect(typeof path).toBe("string");
    expect(recorder.isRecording()).toBe(true);

    await recorder.stop();
    expect(recorder.isRecording()).toBe(false);
  }, 10_000);

  it("throws on double-start", async () => {
    await recorder.start();
    await expect(recorder.start()).rejects.toThrow(/Already recording/);
    await recorder.stop();
  });

  it("throws when stopping without starting", async () => {
    await expect(recorder.stop()).rejects.toThrow(/Not currently recording/);
  });

  it("cleans up temp file on cleanup", async () => {
    const path = await recorder.start();
    await recorder.stop();
    await recorder.cleanup();
    // cleanupTempFile is a no-op if missing, so just ensure no throw
    expect(recorder.getTempFile()).toBeNull();
  });
});

describe("buildArgs", () => {
  it("generates correct ffmpeg args on Linux", () => {
    const args = buildArgs("ffmpeg", "/tmp/out.wav", "mic1");
    expect(args[0]).toBe("ffmpeg");
    expect(args).toContain("-f");
    expect(args).toContain("mic1");
    expect(args[args.length - 1]).toBe("/tmp/out.wav");
  });

  it("generates correct sox args", () => {
    const args = buildArgs("sox", "/tmp/out.wav");
    expect(args).toEqual(["sox", "-d", "/tmp/out.wav"]);
  });

  it("generates correct sox args with device", () => {
    const args = buildArgs("sox", "/tmp/out.wav", "hw:1");
    expect(args).toEqual(["sox", "hw:1", "/tmp/out.wav"]);
  });

  it("generates correct parecord args", () => {
    const args = buildArgs("parecord", "/tmp/out.wav");
    expect(args).toEqual(["parecord", "/tmp/out.wav"]);
  });

  it("generates correct parecord args with device", () => {
    const args = buildArgs("parecord", "/tmp/out.wav", "alsa_input");
    expect(args).toEqual(["parecord", "/tmp/out.wav", "-d", "alsa_input"]);
  });

  it("throws on unsupported tool", () => {
    // @ts-expect-error testing invalid input
    expect(() => buildArgs("invalid", "/tmp/out.wav")).toThrow(/Unsupported audio tool/);
  });
});
