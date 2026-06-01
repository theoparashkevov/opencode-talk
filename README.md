# opencode-talk

Voice-to-text plugin for [opencode](https://opencode.ai). Toggle microphone recording, send audio to OpenAI Whisper for transcription, and inject the result directly into the TUI chat prompt.

## Features

- **Toggle recording** — press once to start, press again to stop + transcribe
- **OpenAI Whisper** transcription with configurable model (`whisper-1` by default)
- **Fallback audio capture** — `ffmpeg` → `sox` → `parecord` (Linux)
- **Clean state machine** — idle → recording → transcribing → idle, with cancellation support
- **Zero temp-file leaks** — cleanup runs on success, error, cancellation, and plugin unload
- **Provider abstraction** — ready for Google Cloud Speech, Azure Speech, AssemblyAI, etc.

## Prerequisites

1. **Bun** (or Node.js with `bun` compatibility)
2. **An audio capture tool** — at least one of:
   - `ffmpeg` (recommended)
   - `sox`
   - `parecord` (Linux)
3. **OpenAI API key** — set via `OPENAI_API_KEY` env var

### Install ffmpeg

```bash
# macOS
brew install ffmpeg

# Debian / Ubuntu
sudo apt update && sudo apt install ffmpeg

# Arch
sudo pacman -S ffmpeg

# Windows (via chocolatey)
choco install ffmpeg
```

## Installation

### Option A: Local plugin file (recommended for development)

Opencode loads **individual files** from the plugin directory. You must bundle the plugin into a single file first.

```bash
# 1. Bundle the plugin into a single JS file
bun run bundle

# 2. Create the global plugins directory if it doesn't exist
mkdir -p ~/.config/opencode/plugins

# 3. Symlink the bundled file (NOT the directory)
ln -s "$(pwd)/dist/opencode-talk.js" ~/.config/opencode/plugins/opencode-talk.js
```

The plugin will auto-load on the next `opencode` startup.

### Option B: npm (when published)

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-talk"]
}
```

npm packages are installed automatically by opencode using Bun at startup.

## Configuration

For local plugins, configuration is resolved from environment variables:

```bash
export OPENAI_API_KEY="sk-..."
```

Optional extras:

| Env Var       | Default       | Description            |
|---------------|---------------|------------------------|
| `OPENAI_KEY`  | —             | Fallback API key       |

When published to npm, config may be passed via `opencode.json` in the future.

## Usage

The plugin exposes **two ways** to use voice-to-text:

### 1. AI Invocation (Agent-facing)

The AI can call the `voiceToggle` tool during conversation. Just ask:

> "Record my voice" — starts recording  
> "Stop and transcribe" — stops and returns text as an AI response

### 2. Direct User Control — `/voice` Slash Command (Recommended)

Type `/` in the prompt to open the command palette, then select **"Toggle Voice Recording"** (or type `/voice` directly).

1. Select `/voice` → toast shows "Recording"
2. Speak into your microphone
3. Select `/voice` again → toast shows "Transcribing"
4. Text is injected directly into your prompt (ready to send)

> **Note on keybindings:** Custom plugin keybindings crash opencode on startup (v1.15.13). Use the `/` command palette for now.

### "No audio capture tool found"

Install `ffmpeg` (see Prerequisites). The plugin auto-detects available tools.

### "Permission denied" when recording

Your user may not have access to the audio device. On Linux:

```bash
sudo usermod -aG audio $USER
# Log out and back in
```

### "Invalid OpenAI API key"

Check that `OPENAI_API_KEY` is set and starts with `sk-`.

### Transcription is empty

Ensure your microphone is not muted and that the recording duration is at least 1–2 seconds. Very short clips may return empty strings from Whisper.

## Architecture

```
src/
├── index.ts              # Plugin entrypoint (async default export)
├── types.ts              # Shared TypeScript interfaces
├── config.ts             # Zod schema + env var resolution
├── utils.ts              # Temp files, logging adapter, safe spawn
├── audio/
│   └── recorder.ts       # ffmpeg / sox / parecord wrapper
└── transcription/
    └── openai.ts         # OpenAI Whisper provider + retry logic
```

## Adding a new transcription provider

1. Implement the `TranscriptionProvider` interface in `src/transcription/<name>.ts`.
2. Update `resolveConfig` to accept the new provider enum value.
3. Instantiate the new provider in `src/index.ts` based on `config.provider`.

## Development

```bash
# Install dependencies
bun install

# Type check
bun run typecheck

# Run tests
bun test

# Build (emit declarations — Bun runs .ts natively, but dist/ is needed for npm)
bun run build
```

## License

MIT
