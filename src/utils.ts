import { writeFile as nodeWriteFile, unlink as nodeUnlink, access as nodeAccess } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import type { OpencodePluginContext, OpencodeAppLogBody } from "./types.js";

// ---------------------------------------------------------------------------
// Temp files
// ---------------------------------------------------------------------------

export async function createTempFile(suffix: string): Promise<string> {
  const name = `opencode-talk-${randomBytes(8).toString("hex")}${suffix}`;
  const path = join(tmpdir(), name);
  await nodeWriteFile(path, Buffer.alloc(0));
  return path;
}

export async function cleanupTempFile(path: string): Promise<void> {
  try {
    await nodeAccess(path);
    await nodeUnlink(path);
  } catch {
    // no-op if missing
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error";

let _logAdapter: ((level: LogLevel, message: string, extra?: Record<string, unknown>) => void) | undefined;

/**
 * Create a log adapter for the official opencode API.
 * When running inside opencode, logs are sent via `client.app.log({ body: ... })`.
 * When running outside (tests), falls back to console.
 */
export function createLogAdapter(ctx: OpencodePluginContext) {
  return (level: LogLevel, message: string, extra?: Record<string, unknown>) => {
    const body: OpencodeAppLogBody = {
      service: "opencode-talk",
      level,
      message,
      ...(extra ? { extra } : {}),
    };

    try {
      ctx.client.app.log({ body });
    } catch {
      // Fallback for tests / outside opencode
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...body }));
    }
  };
}

export function setLogAdapter(
  adapter: (level: LogLevel, message: string, extra?: Record<string, unknown>) => void
): void {
  _logAdapter = adapter;
}

export function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (_logAdapter) {
    _logAdapter(level, message, extra);
    return;
  }
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
}

// ---------------------------------------------------------------------------
// Safe child-process spawn with timeout
// ---------------------------------------------------------------------------

export interface SafeSpawnOptions {
  timeout?: number; // ms, default 60_000
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  signal?: AbortSignal;
}

export interface SafeSpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function safeSpawn(
  command: string,
  args: string[],
  opts: SafeSpawnOptions = {}
): Promise<SafeSpawnResult> {
  const { timeout = 60_000, env, cwd, signal } = opts;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env ?? process.env,
      cwd,
      signal,
    });

    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill("SIGTERM");
      // hard kill after grace period
      setTimeout(() => child.kill("SIGKILL"), 2_000);
    }, timeout);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (killedByTimeout) {
        reject(new Error(`Process timed out after ${timeout}ms`));
        return;
      }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
