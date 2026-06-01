# Installation Guide

How to install and configure opencode-talk for the opencode TUI.

---

## Quick Start (End Users)

No `npm install` required. Opencode auto-installs TUI plugins on startup.

### Step 1: Configure the plugin

Edit (or create) `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@theoparashkevov/opencode-talk"]
}
```

### Step 2: Set your API key

```bash
export OPENAI_API_KEY="sk-..."
```

Add to your `~/.bashrc` or `~/.zshrc` to persist across sessions.

### Step 3: Start opencode

```bash
opencode
```

The plugin is automatically downloaded from npm on first startup.

### Step 4: Use it

- Press `ctrl+x` then `v` to start recording
- Speak naturally
- Press `ctrl+x` then `v` again to stop and transcribe
- The transcript appears in your prompt

---

## Prerequisites

### System dependencies

The plugin needs an audio capture tool. It auto-detects in this order:

| Tool | Install command (Ubuntu/Debian) | Install command (macOS) |
|------|-------------------------------|------------------------|
| **ffmpeg** (preferred) | `sudo apt-get install ffmpeg` | `brew install ffmpeg` |
| **sox** | `sudo apt-get install sox libsox-fmt-all` | `brew install sox` |
| **parecord** (Linux only) | `sudo apt-get install pulseaudio-utils` | — |

### API key

You need an OpenAI API key with access to Whisper:

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new secret key
3. Export it: `export OPENAI_API_KEY="sk-..."`

---

## Configuration

### Using `/voice-config`

Inside the opencode TUI, run the `/voice-config` command to:

- Set API key (if not using environment variable)
- Choose Whisper model (`whisper-1` default)
- Select audio device
- Toggle notification toasts
- Set custom transcription prompt

### Switching between npm and local dev

**For npm releases (most users):**
```json
{
  "plugin": ["@theoparashkevov/opencode-talk"]
}
```

**For local development:**
```json
{
  "plugin": ["/full/path/to/opencode-talk"]
}
```

**Note:** TUI plugins go in `tui.json`, not `opencode.json`. The latter is for core opencode configuration (agents, permissions, etc.).

---

## Developer Installation

If you want to hack on the plugin itself:

```bash
git clone https://github.com/theoparashkevov/opencode-talk.git
cd opencode-talk
bun install

# Set your key
export OPENAI_API_KEY="sk-..."

# Point opencode at this directory
echo '{"plugin":["/full/path/to/opencode-talk"]}' > ~/.config/opencode/tui.json

# Run tests
bun test

# Run opencode
opencode
```

No build step required — Bun runs `index.js` directly, which imports `src/*.ts` files natively.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `No audio capture tool found` | Install `ffmpeg` (see Prerequisites) |
| `Permission denied` when recording | `sudo usermod -aG audio $USER` then log out/in |
| `Invalid OpenAI API key` | Check `OPENAI_API_KEY` starts with `sk-` |
| Plugin not loading | Verify `tui.json` path — use absolute path for local dev |
| Transcription empty | Speak for at least 1–2 seconds; check mic isn't muted |

---

## See Also

- [README](../README.md) — Feature overview and architecture
- [architecture.md](architecture.md) — System design
- [ci-cd.md](ci-cd.md) — Automated release pipeline
