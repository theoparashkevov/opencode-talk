# Opencode Voice Plugin — Work Plan

## TL;DR

> **Quick Summary**: Build an opencode plugin that enables voice-to-text input via microphone toggle (press to start, press to stop+transcribe). Audio captured by ffmpeg (or fallback), transcribed by OpenAI Whisper API (with provider abstraction for future additions), and injected into the TUI prompt.
>
> **Deliverables**:
> - Plugin source code (TypeScript) in `.opencode/plugins/opencode-talk/` or published as npm package
> - Audio recording module (ffmpeg wrapper with fallback chain)
> - Transcription provider abstraction + OpenAI Whisper implementation
> - TUI integration via opencode's `tui.prompt.append` hook
> - Type definitions, error handling, logging, and cleanup
> - README with installation, configuration, and troubleshooting
> - Example `opencode.json` configuration snippet
>
> **Estimated Effort**: Medium (6-8 hours)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 6 → Task 7 → Final Verification

---

## Context

### Original Request
User wants to create an opencode plugin that lets them "talk to open code" — meaning: activate microphone easily, send audio for transcription, and have the transcribed text injected into the chat. OpenAI API for the beginning, with support for other providers later.

### Interview Summary
**Key Decisions**:
- **Recording model**: Toggle recording (press to start, press again to stop+transcribe). True push-to-talk requires OS-level global hotkey listener (outside plugin capabilities), so toggle is the practical V1 approach.
- **Audio capture**: External command spawning — `ffmpeg` preferred, fallback chain to `sox` → `parecord` (Linux) → `avrec` (macOS).
- **Transcription provider**: OpenAI Whisper API for V1, with clean abstraction to add Google Cloud Speech, Azure Speech, AssemblyAI, local Whisper.cpp later.
- **Target mode**: TUI (terminal UI) as primary mode. CLI and Web extensions can be added later.
- **Text injection**: Via opencode's `tui.prompt.append` hook (or `tui.command.execute` if append isn't directly writable).

**Research Findings**:
- Opencode plugin system: Event-driven hooks (`command.executed`, `file.edited`, `message.updated`, `tui.prompt.append`, `tui.command.execute`, `tool.execute.before`/`after`, etc.)
- Plugins return a hooks object; state persists within the plugin module instance.
- No UI injection capability (plugins can't add buttons); triggering happens via commands or keybindings configured in `opencode.json`.
- No prior audio/WebRTC/voice code exists in this repo.

### Metis Review
**Identified Gaps** (addressed):
- `tui.prompt.append` hook writability: We'll verify during implementation and fallback to `tui.command.execute` if needed.
- ffmpeg availability: Add robust detection, clear error messages, and installation instructions.
- Temp file cleanup after transcription: Explicitly handled in the audio capture error handling + cleanup path.
- OpenAI API key configuration: Support both `OPENAI_API_KEY` env var and explicit config in `opencode.json`.
- Audio device selection: Default to system default device, with optional config override.
- Recording cancellation (user changes mind mid-recording): Implemented as part of the toggle state machine.

---

## Work Objectives

### Core Objective
Build a production-ready opencode voice plugin that enables users to dictate text into the TUI chat by toggling voice recording, with audio captured by ffmpeg and transcribed by OpenAI Whisper API.

### Concrete Deliverables
1. `src/index.ts` — Main plugin entrypoint exporting the plugin function
2. `src/audio/recorder.ts` — Audio recording module (ffmpeg wrapper + fallback chain)
3. `src/transcription/provider.ts` — Provider abstraction interface
4. `src/transcription/openai.ts` — OpenAI Whisper provider implementation
5. `src/config.ts` — Configuration parsing and validation (with Zod)
6. `src/utils.ts` — Shared utilities (temp file management, error formatting, logging)
7. `tsconfig.json`, `package.json` — Project configuration
8. `README.md` — Installation, setup, configuration, and troubleshooting
9. `opencode-talk.opencode.json` — Example configuration snippet

### Definition of Done
- [ ] Plugin loads without errors in opencode
- [ ] User can trigger voice recording via toggle command/keybinding
- [ ] Audio is captured to temp file via ffmpeg (or fallback)
- [ ] Audio file is transcribed by OpenAI Whisper API
- [ ] Transcribed text is injected into the TUI prompt
- [ ] Proper cleanup of temp files in all paths (success, error, cancellation)
- [ ] Error handling for: missing ffmpeg, no mic, API errors, network failures, empty transcription
- [ ] TypeScript compiles with strict mode, zero errors
- [ ] Tests pass: unit tests for provider abstraction, integration tests for recorder (mocked)

### Must Have
1. Toggle recording state machine (idle → recording → transcribing → idle)
2. ffmpeg capture with fallback chain (sox → parecord → avrec)
3. OpenAI Whisper transcription with configurable model (`whisper-1` default)
4. Text injection into TUI prompt
5. Config support: `OPENAI_API_KEY` env var or explicit config, optional audio device override
6. Proper error handling and user-friendly error messages (via logging)
7. Temp file cleanup in all code paths

### Must NOT Have (Guardrails)
1. **No push-to-talk / global hotkeys** — out of scope for V1, requires OS-level listener
2. **No browser/WebRTC recording** — TUI only for V1
3. **No real-time streaming transcription** — send complete file after stop
4. **No voice commands or NL actions** — transcribe text only
5. **No mobile/desktop app support** — opencode plugin only
6. **No UI elements/buttons** — plugins can't inject UI into opencode
7. **No audio playback or text-to-speech** — input only

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO — will set up during scaffolding
- **Automated tests**: YES (Tests after implementation)
- **Framework**: `bun test` (native Bun test runner, fast, no config needed)
- **Mocking**: Bun's native `jest.fn()`-compatible mocking for unit tests

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.
- **CLI/TUI**: Use `interactive_bash` (tmux) — simulate typing commands, check output, validate plugin behavior
- **Library/Module**: Use `Bash` (bun REPL) — import functions, call with test data, compare output
- **API**: Use `Bash` (curl) — send requests to OpenAI Whisper API, assert status and response

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation + Scaffolding):
├── Task 1: Project scaffolding + package.json + tsconfig + bun test setup
├── Task 2: Type definitions (config types, provider interface, plugin hooks)
├── Task 3: Audio recording module (ffmpeg wrapper + fallback chain)
├── Task 4: Temp file utility + logger utility
└── Task 5: Configuration module (Zod schema + env var resolution)

Wave 2 (Core Logic + Integration):
├── Task 6: OpenAI Whisper transcription provider
├── Task 7: Main plugin entrypoint (state machine + toggle logic + TUI integration)
├── Task 8: Error handling + edge cases + cancellation logic
├── Task 9: Unit tests for provider abstraction + recorder mocking
└── Task 10: Plugin config example + README installation guide

Wave FINAL (Verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| 1 (Scaffolding) | — | 2, 3, 4, 5 |
| 2 (Types) | 1 | 3, 5, 6, 7 |
| 3 (Recorder) | 1, 2 | 7, 9 |
| 4 (Utils) | 1 | 3, 5, 6, 7 |
| 5 (Config) | 1, 2, 4 | 6, 7 |
| 6 (OpenAI Provider) | 2, 4, 5 | 7, 9 |
| 7 (Main Plugin) | 2, 3, 5, 6 | 8, 9, 10 |
| 8 (Error Handling) | 7 | 9, 10 |
| 9 (Tests) | 3, 6, 7, 8 | 10 |
| 10 (Docs + Config) | 7, 8, 9 | — |
| F1-F4 | ALL above | — |

### Agent Dispatch Summary

- **Wave 1**: Tasks 1-5 → `quick` agents (scaffolding, types, utilities)
- **Wave 2**: Tasks 6-10 → `unspecified-high` agents (core logic, integration, tests)
- **Wave FINAL**: F1-F4 → mixed (oracle, unspecified-high, deep)

---

- [ ] 1. Project Scaffolding + Package Configuration

  **What to do**:
  - Initialize TypeScript project with `bun init` (or manually create `package.json`)
  - Create `tsconfig.json` with strict mode, ESNext target, declaration output
  - Set up `bun test` (native, no config needed)
  - Add dependencies: `@opencode-ai/plugin` (peer/dev dependency for types), `zod`, `openai`
  - Create directory structure: `src/`, `src/audio/`, `src/transcription/`, `src/__tests__/`
  - Add `.gitignore` for node_modules, dist, *.wav, *.flac, .env
  - Add `build` script that compiles to `dist/` (ESM output)

  **Must NOT do**:
  - Do NOT add browser-specific dependencies (no `MediaRecorder`, no WebRTC)
  - Do NOT create a `node_modules` or commit dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: Pure scaffolding, no complex logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `bun install` succeeds with zero errors
  - [ ] `bun test` runs and reports "0 tests found" (no failures)
  - [ ] `bun run build` compiles all `.ts` files from `src/` to `dist/` without errors
  - [ ] `tsconfig.json` has `strict: true`, `target: ES2022`, `module: ESNext`, `declaration: true`
  - [ ] `package.json` has `type: "module"`, `main: "dist/index.js"`, `types: "dist/index.d.ts"`

  **QA Scenarios**:
  ```
  Scenario: Build succeeds
    Tool: Bash
    Preconditions: Fresh clone, no node_modules
    Steps:
      1. Run: bun install
      2. Run: bun run build
    Expected Result: Build completes with zero errors, dist/ contains .js and .d.ts files
    Failure Indicators: TypeScript compilation errors, missing dist/ directory
    Evidence: .sisyphus/evidence/task-1-build-succeeds.png

  Scenario: Test runner works
    Tool: Bash
    Preconditions: bun installed
    Steps:
      1. Create src/__tests__/dummy.test.ts with a passing test
      2. Run: bun test
    Expected Result: Test runner executes, shows 1 pass, 0 fail
    Failure Indicators: Test runner crashes, syntax errors
    Evidence: .sisyphus/evidence/task-1-test-runner.png
  ```

  **Commit**: YES
  - Message: `chore(scaffold): initialize project with TypeScript and bun`
  - Files: package.json, tsconfig.json, bunfig.toml, .gitignore, src/ (empty dirs)

- [ ] 2. Type Definitions + Plugin Interfaces

  **What to do**:
  - Define the `PluginConfig` Zod schema: `apiKey`, `provider`, `audioDevice`, `model` fields
  - Define `TranscriptionProvider` abstract interface: `transcribe(audioPath: string): Promise<string>`
  - Define `AudioRecorder` interface: `start(), stop(), isRecording(): boolean`
  - Define `VoicePluginState` type: `{ isRecording: boolean, tempFile: string | null, provider: ProviderName }`
  - Define opencode plugin hook types (from `@opencode-ai/plugin` or manually if unavailable)
  - Export all types from `src/types.ts` for internal use

  **Must NOT do**:
  - Do NOT implement any providers or recorders here — types only
  - Do NOT add `any` types — everything must be typed

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: Type definitions are declarative, no runtime logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 5, 6, 7
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] `bun typecheck` (or `tsc --noEmit`) passes with zero errors
  - [ ] All types compile with `strict: true`
  - [ ] `PluginConfig` validates correct config objects and rejects malformed ones
  - [ ] Type exports are accessible from the main index

  **QA Scenarios**:
  ```
  Scenario: Types compile cleanly
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Create src/types.ts with all type definitions
      2. Run: tsc --noEmit
    Expected Result: Zero type errors
    Failure Indicators: TypeScript errors, missing type exports
    Evidence: .sisyphus/evidence/task-2-types-compile.txt

  Scenario: Config validation works
    Tool: Bash (bun REPL)
    Preconditions: Zod schema defined
    Steps:
      1. Import config schema
      2. Call schema.parse({ apiKey: "sk-test", provider: "openai" })
      3. Call schema.parse({ provider: "openai" }) (missing apiKey should fail)
    Expected Result: First call returns valid object, second throws ZodError
    Failure Indicators: No validation error on invalid input
    Evidence: .sisyphus/evidence/task-2-config-validation.txt
  ```

  **Commit**: YES (grouped with Wave 1)

- [ ] 3. Audio Recording Module (ffmpeg + Fallback Chain)

  **What to do**:
  - Create `src/audio/recorder.ts` implementing the `AudioRecorder` interface
  - Implement `detectAudioTool()`: Check `ffmpeg` -> `sox` -> `parecord` (Linux) -> `avrec` (macOS) via `which` or `command -v`
  - Implement `startRecording(audioDevice?)`: Spawn the detected tool as child process, recording to a temp `.wav` file. Return temp file path.
  - Implement `stopRecording()`: Send SIGTERM or appropriate kill signal to child process, wait for process exit.
  - Implement `isRecording()`: Return boolean based on whether child process exists and is running.
  - Make `ffmpeg` command configurable: `ffmpeg -f <device> -i default output.wav` (platform-specific `-f` flags: `avfoundation` on macOS, `alsa` on Linux, `dshow` on Windows)
  - Make `sox` fallback command: `sox -d output.wav` (uses default device)
  - Add process cleanup: Kill orphaned child on plugin unload or unexpected exit.

  **Must NOT do**:
  - Do NOT use native Node.js audio modules (they have platform-specific binary dependencies)
  - Do NOT assume ffmpeg is installed — always detect and provide clear error

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: Platform differences in audio APIs, process management, and error handling require careful attention

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7, 9
  - **Blocked By**: Tasks 1, 2

  **Acceptance Criteria**:
  - [ ] `detectAudioTool()` returns the available tool name or throws clear "no audio tool found" error
  - [ ] `startRecording()` spawns ffmpeg (or sox) child process recording to temp file
  - [ ] `stopRecording()` terminates process gracefully and temp file exists with > 0 bytes
  - [ ] `isRecording()` correctly reflects state before/during/after recording
  - [ ] Orphaned processes are killed on unexpected exit

  **QA Scenarios**:
  ```
  Scenario: ffmpeg detection works
    Tool: Bash
    Preconditions: ffmpeg installed on system
    Steps:
      1. Import detectAudioTool from recorder.ts
      2. Run: detectAudioTool()
    Expected Result: Returns "ffmpeg" (or next available tool)
    Failure Indicators: Returns null, throws unhelpful error, hangs
    Evidence: .sisyphus/evidence/task-3-ffmpeg-detection.txt

  Scenario: Record 2-second audio clip
    Tool: Bash (bun REPL)
    Preconditions: ffmpeg installed
    Steps:
      1. Create recorder instance
      2. Call startRecording() -> get temp path
      3. Wait 2 seconds
      4. Call stopRecording()
      5. Check: ls -lh <temp-path>
    Expected Result: File exists, size > 1KB, is a valid WAV (detect via file command or ffprobe)
    Failure Indicators: File doesn't exist, size 0 bytes, process didn't exit
    Evidence: .sisyphus/evidence/task-3-record-clip.wav + .txt

  Scenario: Graceful error when no audio tool
    Tool: Bash
    Preconditions: Temporarily PATH without ffmpeg/sox (or mock the detection)
    Steps:
      1. Call startRecording() with no available tools
    Expected Result: Throws clear error: "No audio capture tool found. Install ffmpeg: ..."
    Failure Indicators: Silent failure, cryptic error, process hang
    Evidence: .sisyphus/evidence/task-3-no-tool-error.txt
  ```

  **Commit**: YES (grouped with Wave 1)

- [ ] 4. Shared Utilities (Temp Files + Logger + Error Formatter)

  **What to do**:
  - Create `src/utils.ts`:
    - `createTempFile(suffix: string): Promise<string>` — uses `os.tmpdir()` + random suffix, returns absolute path
    - `cleanupTempFile(path: string): Promise<void>` — deletes file if it exists, no-op if missing
    - `log(level, message, meta?)` — wrapper around `console.log` for now (plugin context logger can be swapped in later)
    - `formatError(error)` — converts errors to user-friendly strings for TUI display
    - `safeSpawn(command, args)` — wraps `Bun.spawn`/`child_process.spawn` with timeout and cleanup guarantees
  - Add tests for temp file creation + cleanup

  **Must NOT do**:
  - Do NOT write to project directory — only use `os.tmpdir()`
  - Do NOT expose sensitive data (API keys) in logs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: Utility functions are straightforward, well-scoped

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 5, 6, 7
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] `createTempFile(".wav")` returns a path in `/tmp/` (or platform equivalent) ending in `.wav`
  - [ ] `cleanupTempFile()` deletes the file and doesn't throw if file doesn't exist
  - [ ] `log()` outputs structured JSON: `{"level":"info","message":"...","timestamp":"..."}`
  - [ ] `safeSpawn()` kills the process after a configurable timeout (default 60s)

  **QA Scenarios**:
  ```
  Scenario: Temp file lifecycle
    Tool: Bash (bun REPL)
    Preconditions: utils.ts implemented
    Steps:
      1. Call createTempFile(".wav") -> path
      2. Check: test -f <path>
      3. Call cleanupTempFile(path)
      4. Check: test ! -f <path>
    Expected Result: File created, then removed, no errors
    Failure Indicators: File not created, cleanup throws, file still exists
    Evidence: .sisyphus/evidence/task-4-temp-lifecycle.txt

  Scenario: Safe spawn timeout
    Tool: Bash (bun REPL)
    Preconditions: utils.ts implemented
    Steps:
      1. Call safeSpawn("sleep", ["120"], { timeout: 1000 })
      2. Wait 2 seconds
      3. Check process is killed
    Expected Result: Process exits within 2 seconds (timeout respected)
    Failure Indicators: Process still running after timeout
    Evidence: .sisyphus/evidence/task-4-spawn-timeout.txt
  ```

  **Commit**: YES (grouped with Wave 1)

- [ ] 5. Configuration Module (Zod Schema + Resolution)

  **What to do**:
  - Create `src/config.ts`:
    - Define Zod schema: `{ apiKey: z.string().min(1), provider: z.enum(["openai"]).default("openai"), model: z.string().default("whisper-1"), audioDevice: z.string().optional() }`
    - Implement `resolveConfig(input)`:
      1. Parse input object (passed from plugin ctx or opencode config)
      2. If `apiKey` missing, check `process.env.OPENAI_API_KEY`
      3. If still missing, check `process.env.OPENAI_API_KEY` (with common var names: `OPENAI_API_KEY`, `OPENAI_KEY`)
      4. Validate final config with Zod
      5. Return typed `PluginConfig`
    - Provide typed `defaultConfig`
  - Add a `config.test.ts` verifying env var fallback and validation errors

  **Must NOT do**:
  - Do NOT store API key in code or log it
  - Do NOT require config file — env var should work standalone

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: Validation logic is deterministic and well-scoped

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2, 4

  **Acceptance Criteria**:
  - [ ] `resolveConfig({})` with `OPENAI_API_KEY=sk-test` env returns valid config
  - [ ] `resolveConfig({ apiKey: "sk-test" })` returns valid config without env var
  - [ ] `resolveConfig({})` without env var throws clear error: "API key required"
  - [ ] `resolveConfig({ model: "whisper-1" })` uses provided model, not default

  **QA Scenarios**:
  ```
  Scenario: Config from env var
    Tool: Bash (bun REPL)
    Preconditions: set OPENAI_API_KEY=sk-test
    Steps:
      1. Call resolveConfig({})
    Expected Result: Returns config with apiKey="sk-test", provider="openai", model="whisper-1"
    Failure Indicators: apiKey is null, wrong defaults applied
    Evidence: .sisyphus/evidence/task-5-config-env.txt

  Scenario: Config with explicit overrides
    Tool: Bash (bun REPL)
    Steps:
      1. Call resolveConfig({ apiKey: "sk-explicit", model: "whisper-large-v3" })
    Expected Result: apiKey="sk-explicit", model="whisper-large-v3"
    Failure Indicators: Overrides ignored, defaults used instead
    Evidence: .sisyphus/evidence/task-5-config-explicit.txt

  Scenario: Missing API key error
    Tool: Bash (bun REPL)
    Preconditions: No OPENAI_API_KEY env var set
    Steps:
      1. Call resolveConfig({})
    Expected Result: Throws ZodError with clear message: "apiKey is required"
    Failure Indicators: Returns partial config, throws generic error
    Evidence: .sisyphus/evidence/task-5-config-error.txt
  ```

  **Commit**: YES (grouped with Wave 1)

---

- [ ] 6. OpenAI Whisper Transcription Provider

  **What to do**:
  - Create `src/transcription/openai.ts` implementing the `TranscriptionProvider` interface
  - Use the official `openai` npm package (already added in Task 1) to transcribe audio files
  - Implement `transcribe(audioPath: string): Promise<string>`:
    1. Read audio file as `File` object (or stream for large files)
    2. Call `openai.audio.transcriptions.create({ file, model: config.model })`
    3. Return `transcription.text`
  - Handle OpenAI API errors: rate limit, invalid file format, auth errors
  - Support both `whisper-1` and `gpt-4o-transcribe` models
  - Include retry logic with exponential backoff (max 3 retries) for transient errors
  - Add validation: check file exists, size < 25MB (OpenAI limit), duration reasonable

  **Must NOT do**:
  - Do NOT stream audio to API — send complete file (no real-time streaming in V1)
  - Do NOT expose API response details to user — only return transcribed text or human-friendly error

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: External API integration, error handling, retry logic, file I/O interactions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10)
  - **Blocks**: Task 7, 9
  - **Blocked By**: Tasks 2, 4, 5

  **Acceptance Criteria**:
  - [ ] Provider implements `TranscriptionProvider` interface correctly
  - [ ] `transcribe()` sends file to OpenAI and returns text (mock in tests)
  - [ ] Retries 3 times on rate limit errors (429) with exponential backoff
  - [ ] Throws clear error on auth failure (401): "Invalid OpenAI API key"
  - [ ] Validates file size < 25MB before sending

  **QA Scenarios**:
  ```
  Scenario: Successful transcription (mocked)
    Tool: Bash (bun REPL)
    Preconditions: openai provider implemented, mock fetch
    Steps:
      1. Create a small valid audio file (1 second silence via ffmpeg)
      2. Call provider.transcribe(audioPath)
      3. Mock OpenAI response to return "Hello world"
    Expected Result: Returns "Hello world"
    Failure Indicators: Returns undefined, throws error, hangs
    Evidence: .sisyphus/evidence/task-6-transcribe-mock.txt

  Scenario: Rate limit retry (mocked)
    Tool: Bash (bun REPL)
    Preconditions: Mock fetch returning 429 twice, then success
    Steps:
      1. Call provider.transcribe(audioPath)
    Expected Result: Retries twice, then succeeds
    Failure Indicators: Fails immediately on 429, retries more than 3 times, hangs
    Evidence: .sisyphus/evidence/task-6-retry-mock.txt

  Scenario: Auth error (mocked)
    Tool: Bash (bun REPL)
    Preconditions: Mock fetch returning 401
    Steps:
      1. Call provider.transcribe(audioPath)
    Expected Result: Throws clear error: "Invalid OpenAI API key"
    Failure Indicators: Generic error, returns empty string, retries (should not retry 401)
    Evidence: .sisyphus/evidence/task-6-auth-error.txt
  ```

  **Commit**: YES (grouped with Wave 2)

- [ ] 7. Main Plugin Entrypoint (State Machine + Toggle Logic + TUI Integration)

  **What to do**:
  - Create `src/index.ts` exporting the main plugin function conforming to opencode's plugin signature
  - Plugin function receives `{ project, client, $, directory, worktree }` from opencode
  - Initialize state: `isRecording = false`, `recorder` instance, `provider` instance, `tempFile` path
  - Register custom tool `voice:toggle` (or use `tool` export pattern from `@opencode-ai/plugin`)
  - Tool execute logic:
    1. If `!isRecording`: Call `recorder.start()` → update `isRecording = true`, `tempFile = path`, log "Recording started..."
    2. If `isRecording`: Call `recorder.stop()` → read `tempFile` → call `provider.transcribe(tempFile)` → inject text into TUI prompt
       - If `tui.prompt.append` is writable: Directly append text
       - If not: Return text from tool execution → opencode may insert into conversation
       - If that doesn't work: Use `client.sendMessage()` or equivalent to send as user message
    3. In both cases, clean up `tempFile` using `cleanupTempFile()` **after** transcription
  - Handle edge case: Recording started but never stopped (e.g., plugin unloads) — force stop and cleanup

  **Must NOT do**:
  - Do NOT block the TUI while transcribing (use async/Promise)
  - Do NOT leave temp files after transcription (cleanup in both success and error paths)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Reason**: Complex state machine with async transitions, external process management, UI integration via plugin hooks

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8, 9, 10
  - **Blocked By**: Tasks 2, 3, 5, 6

  **Acceptance Criteria**:
  - [ ] Plugin exports function that matches opencode's expected signature
  - [ ] Toggle tool can be called twice (start → stop) and produces transcription
  - [ ] Recording state is correct at all times (idle, recording, transcribing)
  - [ ] Text injection into TUI prompt works (verified via mock or actual integration)
  - [ ] No temp files remain after completion

  **QA Scenarios**:
  ```
  Scenario: Full toggle flow (mocked recorder + provider)
    Tool: Bash (bun REPL)
    Preconditions: Plugin loaded with mocked recorder and provider
    Steps:
      1. Call voiceToggle() -> isRecording becomes true
      2. Mock recorder to have created temp file with content
      3. Call voiceToggle() again -> recorder stops, provider called with temp file
      4. Provider returns "Test transcription"
    Expected Result: Transcription "Test transcription" is returned/injected, isRecording becomes false, temp file cleaned up
    Failure Indicators: State stuck in recording, transcription not returned, temp file still exists
    Evidence: .sisyphus/evidence/task-7-toggle-flow.txt

  Scenario: TUI text injection (integration)
    Tool: interactive_bash (tmux)
    Preconditions: Plugin installed in opencode, mock provider returning "Hello opencode"
    Steps:
      1. Start opencode TUI session
      2. Trigger voice toggle command
      3. Trigger voice toggle again
      4. Check TUI prompt contains "Hello opencode"
    Expected Result: Transcribed text appears in the current prompt
    Failure Indicators: Text not injected, appears as a separate message, not in prompt
    Evidence: .sisyphus/evidence/task-7-tui-injection.txt
  ```

  **Commit**: YES (grouped with Wave 2)

- [ ] 8. Error Handling + Edge Cases + Cancellation Logic

  **What to do**:
  - Enhance all modules with comprehensive error handling:
    - **Audio errors**: No mic detected (Permission denied), no audio tool installed, disk full, file too large
    - **API errors**: Network timeout, auth failure, rate limit exhausted (after retries), invalid model
    - **State errors**: Toggle called when already stopping, plugin unloaded mid-recording, double-start
  - Implement **cancellation**: If user triggers toggle a third time during transcription, cancel the API request and reset to idle
  - Add user-friendly error logging via opencode's client logging (`client.app.log()`) where available
  - Add fallback text injection: If `tui.prompt.append` fails, try returning text from tool; if that fails, log error
  - Ensure **cleanup runs in ALL paths**: try/finally blocks or equivalent in every async function that creates temp files or spawns processes

  **Must NOT do**:
  - Do NOT swallow errors silently — always log or throw
  - Do NOT leave orphaned ffmpeg processes or temp files in any error scenario

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: Error handling requires covering all failure modes and ensuring no resource leaks

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Task 7

  **Acceptance Criteria**:
  - [ ] Every temp file creation has a matching cleanup call
  - [ ] Orphaned ffmpeg process is killed if plugin unloads
  - [ ] Cancellation interrupts API request and resets state to idle
  - [ ] All errors produce clear, actionable user messages
  - [ ] `bun test` passes for all error scenarios

  **QA Scenarios**:
  ```
  Scenario: Orphaned process cleanup on plugin unload
    Tool: Bash (bun REPL)
    Preconditions: Recording in progress
    Steps:
      1. Start recording via plugin
      2. Simulate plugin unload (call cleanup function or destroy plugin context)
      3. Check: pgrep ffmpeg (or ps aux | grep ffmpeg)
    Expected Result: No ffmpeg process running after cleanup
    Failure Indicators: ffmpeg process still alive after plugin cleanup
    Evidence: .sisyphus/evidence/task-8-orphan-cleanup.txt

  Scenario: Cancellation mid-transcription
    Tool: Bash (bun REPL)
    Preconditions: Transcription in progress (mock slow API)
    Steps:
      1. Start recording, stop to trigger transcription
      2. While transcription pending, call toggle again (cancel)
      3. Check state is idle
    Expected Result: API request aborted, state reset to idle, temp file cleaned up
    Failure Indicators: State stuck in "transcribing", API call continues
    Evidence: .sisyphus/evidence/task-8-cancellation.txt

  Scenario: Double-start protection
    Tool: Bash (bun REPL)
    Steps:
      1. Call voiceToggle() to start recording
      2. Immediately call voiceToggle() again
    Expected Result: Second call returns error: "Already recording" or is no-op
    Failure Indicators: Second call starts another recording process, state corrupted
    Evidence: .sisyphus/evidence/task-8-double-start.txt
  ```

  **Commit**: YES (grouped with Wave 2)

- [ ] 9. Unit + Integration Tests

  **What to do**:
  - Create test files:
    - `src/__tests__/config.test.ts` — Test config resolution (env var, explicit, missing key, defaults)
    - `src/__tests__/recorder.test.ts` — Mock ffmpeg process, test start/stop/state detection
    - `src/__tests__/provider.test.ts` — Mock OpenAI client, test transcribe/success/error/retry
    - `src/__tests__/plugin.test.ts` — Test state machine transitions (idle→recording→transcribing→idle)
    - `src/__tests__/utils.test.ts` — Temp file create/cleanup, safeSpawn timeout
  - Mock external dependencies:
    - `ffmpeg` child process: use Bun's mock or manual spawn mock
    - `openai` client: mock the API calls
    - File system: use temp files in `/tmp/`, clean up after
  - Target: 80%+ line coverage for business logic (not utility one-liners)
  - All tests run with `bun test` and pass

  **Must NOT do**:
  - Do NOT make real network calls in tests — always mock OpenAI API
  - Do NOT depend on real ffmpeg being installed in test environment

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Reason**: Comprehensive test suite covering async flows, mocking external APIs, and state machines

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 3, 6, 7, 8

  **Acceptance Criteria**:
  - [ ] `bun test` runs all tests with zero failures
  - [ ] Coverage: provider (100%), recorder (90%), config (100%), plugin (80% of state logic)
  - [ ] All mocked API calls verified with correct parameters
  - [ ] No real network requests made during test run

  **QA Scenarios**:
  ```
  Scenario: Test suite passes
    Tool: Bash
    Preconditions: All source code implemented
    Steps:
      1. Run: bun test
    Expected Result: All tests pass, no errors, coverage report generated
    Failure Indicators: Test failures, compilation errors, real network calls detected
    Evidence: .sisyphus/evidence/task-9-test-suite.txt + coverage report
  ```

  **Commit**: YES (grouped with Wave 2)

- [ ] 10. Documentation + Example Config + README

  **What to do**:
  - Write `README.md` with:
    - Feature overview (toggle recording, OpenAI transcription)
    - Installation instructions (npm install, or clone to `.opencode/plugins/`)
    - Configuration: `opencode.json` snippet showing plugin registration + options
    - Environment variables: `OPENAI_API_KEY`
    - Audio tool setup: `brew install ffmpeg` / `apt install ffmpeg` / etc.
    - opencode keybinding example: how to bind `Ctrl+Shift+V` to the `voice:toggle` tool
    - Troubleshooting: "No audio tool found", "Permission denied", "Invalid API key"
  - Create `opencode-talk.opencode.json` — example config file for users to copy
  - Document the provider abstraction: how to add a new provider (Google, Azure, etc.)
  - Add `CHANGELOG.md` with V1 features
  - Update `package.json` metadata: name, version, description, repository, keywords (opencode, voice, whisper, speech-to-text)

  **Must NOT do**:
  - Do NOT publish to npm yet (can be a follow-up task)
  - Do NOT create a full website or marketing materials

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Reason**: Documentation is prose and technical writing, not code logic

  **Parallelization**:
  - **Can Run In Parallel**: YES (can draft concurrently with Task 9)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Tasks 7, 8, 9 (needs accurate implementation details)

  **Acceptance Criteria**:
  - [ ] `README.md` exists with all required sections
  - [ ] Example config file is valid JSON and matches the plugin's config schema
  - [ ] Installation instructions work on macOS, Linux, and Windows (with WSL note)
  - [ ] Troubleshooting covers the 3 most common error scenarios

  **QA Scenarios**:
  ```
  Scenario: Example config is valid
    Tool: Bash
    Preconditions: README + example config written
    Steps:
      1. Run: cat opencode-talk.opencode.json | python -m json.tool (or jq)
      2. Verify all required fields present
    Expected Result: Valid JSON, no syntax errors, all plugin options documented
    Failure Indicators: Invalid JSON, missing fields, incorrect schema
    Evidence: .sisyphus/evidence/task-10-config-valid.txt

  Scenario: README covers installation
    Tool: None (manual review)
    Preconditions: README written
    Steps:
      1. Read README Installation section
    Expected Result: Clear steps: 1) install ffmpeg, 2) set OPENAI_API_KEY, 3) add plugin to opencode.json, 4) bind key or use command
    Failure Indicators: Missing steps, unclear instructions, no ffmpeg install guidance
    Evidence: README.md (saved as artifact)
  ```

  **Commit**: YES (grouped with Wave 2) — `docs: add README, example config, and installation guide`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  **What to do**: Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check functions). For each "Must NOT Have": search codebase for forbidden patterns (push-to-talk code, browser APIs, UI injection). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  **Acceptance Criteria**:
  - [ ] All 10 tasks have corresponding source files
  - [ ] All "Must Have" items are implemented
  - [ ] No "Must NOT Have" items found in codebase
  - [ ] Evidence files exist for every task's QA scenarios
  **Output**: `Must Have [7/7] | Must NOT Have [7/7] | Tasks [10/10] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  **What to do**: Run `tsc --noEmit` (type checking) + `bun lint` (if configured) + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop patterns: excessive comments, over-abstraction, generic variable names (`data`/`result`/`item`/`temp`).
  **Acceptance Criteria**:
  - [ ] `tsc --noEmit` passes with zero errors
  - [ ] `bun test` passes with zero failures (or all expected failures documented)
  - [ ] Zero `any` types (except where absolutely necessary with inline comment)
  - [ ] No dead code (unused imports, commented-out blocks)
  **Output**: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | AI Slop [CLEAN/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  **What to do**: Start from clean state. Install the plugin into a fresh opencode config. Execute a voice toggle: start recording, speak a phrase (or play a test audio file), stop recording, verify transcription appears in TUI prompt. Test edge cases: no ffmpeg installed (should show clear error), missing API key (should show error), rapid double-toggle (should not crash), cancel during transcription (should reset state).
  **Acceptance Criteria**:
  - [ ] Voice toggle produces transcription in TUI prompt
  - [ ] Missing ffmpeg shows clear install instructions
  - [ ] Missing API key shows clear error
  - [ ] Double-toggle doesn't crash or corrupt state
  - [ ] Cancellation resets state and cleans up
  **Output**: `Scenarios [N/N pass] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  **What to do**: For each task, read "What to do", read actual code. Verify 1:1 — everything in spec was built (no missing features), nothing beyond spec was built (no scope creep). Check "Must NOT do" compliance. Detect cross-task contamination (Task N touching Task M's files). Flag unaccounted changes.
  **Acceptance Criteria**:
  - [ ] All Task 1-10 descriptions match implemented code
  - [ ] No features built that weren't in the plan
  - [ ] No "Must NOT Have" items present
  - [ ] Clean separation of concerns across modules
  **Output**: `Tasks [10/10 compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

> **All agents must output APPROVE. If any outputs REJECT, fix issues and re-run verification. Only mark complete after explicit user "okay".**

---

## Commit Strategy

- **Wave 1 commits** (grouped):
  - `chore(scaffold): initialize project with TypeScript and bun` — Task 1
  - `feat(types): add plugin interfaces and configuration schema` — Task 2
  - `feat(audio): implement ffmpeg recorder with fallback chain` — Task 3
  - `feat(utils): add temp file management and logging utilities` — Task 4
  - `feat(config): implement configuration resolution with env var fallback` — Task 5
- **Wave 2 commits** (grouped):
  - `feat(transcription): add OpenAI Whisper provider with retry logic` — Task 6
  - `feat(plugin): implement main voice toggle with state machine and TUI integration` — Task 7
  - `fix(handling): add comprehensive error handling and cancellation` — Task 8
  - `test(coverage): add unit and integration tests` — Task 9
  - `docs(readme): add installation guide, example config, and troubleshooting` — Task 10
- **Final verification**: No commit needed (review only)

---

## Success Criteria

### Verification Commands
```bash
# Type checking
bun run build   # Expected: zero errors, dist/ populated

# Test suite
bun test        # Expected: all tests pass, coverage > 80%

# Plugin loads in opencode
opencode --version  # verify opencode is installed
# Place plugin in ~/.config/opencode/plugins/ or .opencode/plugins/
# Start opencode TUI, trigger voice toggle, verify transcription
```

### Final Checklist
- [ ] All "Must Have" present and verified
- [ ] All "Must NOT Have" absent and verified
- [ ] All tests pass (`bun test`)
- [ ] TypeScript compiles cleanly (`bun run build`)
- [ ] No temp files left after operations
- [ ] No orphaned ffmpeg processes after plugin unloads
- [ ] README installation instructions validated on target platform
- [ ] Plugin can be installed via npm or local file placement
- [ ] User can configure via `opencode.json` or env vars