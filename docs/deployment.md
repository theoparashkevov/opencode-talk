# Deployment

How to install, distribute, and publish opencode-talk.

---

## Table of Contents

- [Development installation](#development-installation)
- [Production installation](#production-installation)
- [Bundling for distribution](#bundling-for-distribution)
- [Publishing to npm](#publishing-to-npm)
- [Versioning strategy](#versioning-strategy)
- [CI/CD considerations](#cicd-considerations)

---

## Development installation

For active development or quick experimentation:

```bash
git clone https://github.com/theoparashkevov/opencode-talk.git
cd opencode-talk
bun install

# Point opencode at this directory
echo '{"plugin":["/full/path/to/opencode-talk"]}' > ~/.config/opencode/tui.json

# Set your key
export OPENAI_API_KEY="sk-..."

# Run
opencode
```

No build step. Bun runs `index.js` directly, which imports `src/*.ts` files natively.

### Why a symlink doesn't work

opencode's TUI plugin loader resolves the path in `tui.json` and calls `import()` on it. A symlink works in principle, but using the absolute path in `tui.json` avoids any resolution ambiguity.

---

## Production installation

When the package is published to npm:

```json
// ~/.config/opencode/tui.json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-talk"]
}
```

opencode will:
1. Resolve `"opencode-talk"` via npm
2. Install it (and dependencies) using Bun
3. Load the plugin on startup

No manual `git clone` or `bun install` required.

---

## Bundling for distribution

For single-file distribution (e.g. sharing a `.js` file):

```bash
bun build ./index.js --outfile=dist/opencode-talk.js --target=bun --format=esm
```

This produces a self-contained ESM file that bundles all `src/` imports into a single module. You can then:

```bash
ln -s "$(pwd)/dist/opencode-talk.js" ~/.config/opencode/plugins/opencode-talk.js
```

The `--target=bun` flag ensures Bun-specific APIs (like `Bun.file()`) are preserved.

---

## Publishing to npm

### 1. Update version

```bash
npm version patch  # or minor, major
```

### 2. Check package.json

```json
{
  "name": "opencode-talk",
  "version": "1.0.1",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "README.md", "LICENSE"],
  "keywords": ["opencode", "voice", "whisper", "speech-to-text", "plugin"]
}
```

### 3. Build and publish

```bash
bun run build      # emits TypeScript declarations
bun run bundle     # creates dist/ files
npm publish        # or: npm publish --access public
```

### 4. Tag the release

```bash
git push --follow-tags
```

---

## Versioning strategy

We follow [SemVer](https://semver.org/):

| Bump | When |
|------|------|
| **Major (X.0.0)** | Breaking change to public API (e.g. removing a setting, changing `TranscriptionProvider` interface) |
| **Minor (x.Y.0)** | New feature, backward compatible (e.g. new provider, new setting, new command) |
| **Patch (x.y.Z)** | Bug fix, docs update, performance improvement |

### Public API surface

The "public API" for SemVer purposes includes:
- `TranscriptionProvider` interface
- `AudioRecorder` interface
- `TalkConfig` interface
- `index.js` default export shape (`{ id, tui }`)
- KV key names (changing them resets user settings)

Internal implementation details (e.g. `FfmpegRecorder`'s private methods, `buildArgs` signature) are not part of the public API and can change in minors.

---

## CI/CD considerations

### Test matrix

```yaml
# .github/workflows/test.yml (conceptual)
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest]
    bun-version: [1.0, 1.1]
steps:
  - uses: oven-sh/setup-bun@v1
    with:
      bun-version: ${{ matrix.bun-version }}
  - run: bun install
  - run: bun test
```

### Pre-publish checks

```bash
bun run typecheck
bun test
bun run build
bun run bundle
```

### Audio tool availability in CI

GitHub Actions runners do not have `ffmpeg` installed by default. Add:

```yaml
- run: sudo apt-get install -y ffmpeg  # ubuntu
# or:
- run: brew install ffmpeg             # macos
```

Tests that require actual audio capture (integration tests) should be skipped in CI or mocked.

### Automatic publishing

Consider using GitHub Actions to publish on version tag push:

```yaml
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test
      - run: bun run build
      - run: npm publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```
