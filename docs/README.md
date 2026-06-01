# opencode-talk Documentation

Welcome to the internal documentation for **opencode-talk** — a voice-to-text plugin for the opencode terminal IDE.

## Navigation

| Document | What you'll learn |
|----------|-------------------|
| [Architecture](architecture.md) | How the plugin is structured, data flows, state machine, lifecycle |
| [Components](components.md) | Deep dive into every module: recorder, provider, settings, utils |
| [API Reference](api.md) | Public interfaces, key functions, type signatures |
| [Development Guide](development.md) | How to run, test, extend, and add new features |
| [Deployment](deployment.md) | Installation methods, npm publishing, versioning |
| [CI/CD](ci-cd.md) | Automated testing, releasing, and publishing pipeline |
| [CI/CD](ci-cd.md) | Automated testing, releasing, and publishing pipeline |
| [CI/CD](ci-cd.md) | Automated testing, releasing, and publishing pipeline |
| [CI/CD](ci-cd.md) | Automated testing, releasing, and publishing pipeline |

## Quick orientation

```
opencode-talk/
├── index.js                 ← Plugin entrypoint (TUI contract)
├── src/
│   ├── audio/recorder.ts    ← Microphone capture (ffmpeg/sox/parecord)
│   ├── transcription/       ← STT providers (OpenAI Whisper today)
│   ├── settings.ts          ← KV-backed user preferences
│   ├── types.ts             ← Shared interfaces
│   ├── utils.ts             ← Temp files, logging, safe spawn
│   └── __tests__/           ← 37 unit tests
├── .github/workflows/       ← CI/CD: test on PR, release + publish on tag
├── assets/
│   └── banner.svg           ← README header image
└── docs/                    ← You are here
```

## Philosophy

This plugin is designed with three principles in mind:

1. **Zero friction** — One key chord to record, one to stop. No browser, no copy-paste.
2. **Safe by default** — Temp files clean themselves up. Processes get SIGKILL if they hang. Nothing leaks.
3. **Extensible without forks** — New transcription provider? ~20 lines. New audio backend? Implement `AudioRecorder`.

## Contributing

Before adding a feature, read the [Architecture](architecture.md) and [Development](development.md) guides. They explain our invariants (e.g., "always clean up temp files") and our design patterns (e.g., "provider abstraction", "KV persistence").

For the public-facing pitch, see the root [README.md](../README.md).
