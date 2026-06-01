# Deployment & Publishing

How to install, distribute, and publish opencode-talk — manually and via automated CI/CD.

---

## Table of Contents

- [Published on npm](#published-on-npm)
- [Installing from npm](#installing-from-npm)
- [Development installation](#development-installation)
- [Manual publishing checklist](#manual-publishing-checklist)
- [Automated CI/CD publishing](#automated-cicd-publishing)
- [Versioning strategy](#versioning-strategy)
- [Troubleshooting](#troubleshooting)

---

## Published on npm

The package is published to the **public npm registry** as a scoped package:

```
https://www.npmjs.com/package/@theoparashkevov/opencode-talk
```

**Why scoped (`@theoparashkevov/`)?** npm requires scoped packages when using granular access tokens. This is standard for personal packages and avoids name-squatting issues.

---

## Installing from npm

### For end users (opencode TUI)

Add to `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@theoparashkevov/opencode-talk"]
}
```

Opencode auto-installs the package on startup — no `npm install` needed.

### For developers (standalone use)

```bash
npm install @theoparashkevov/opencode-talk
```

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

No build step for development — Bun runs `index.js` directly, which imports `src/*.ts` files natively.

---

## Manual publishing checklist

Use this if you ever need to publish manually (e.g., CI is down).

### Prerequisites

- npm account with **2FA enabled**
- Granular access token with **Publish** scope for `@theoparashkevov`
- Logged in via `npm login` or token configured

### Steps

```bash
# 1. Ensure you're on main, everything is committed
git checkout main
git pull origin main

# 2. Run tests locally
bun install
bun run typecheck
bun test

# 3. Bundle
bun run bundle

# 4. Bump version (creates git tag)
npm version patch   # or minor, major

# 5. Push the version bump and tag
git push --follow-tags

# 6. Publish to npm
npm publish --access public
```

---

## Automated CI/CD publishing

The repository includes GitHub Actions workflows that handle testing, releasing, and publishing automatically.

### What the pipeline does

| Trigger | Workflow | What happens |
|---------|----------|--------------|
| Push to `main` or PR | `.github/workflows/ci.yml` | Installs deps → type checks → runs tests → builds bundle |
| Push tag `v*` | `.github/workflows/release.yml` | Runs CI → publishes to npm → creates GitHub Release |

### Setting up the automated pipeline

#### Step 1: Add the npm token as a GitHub secret

1. Go to **[npmjs.com](https://www.npmjs.com)** → log in → **Access Tokens**
2. Ensure you have a **granular token** with:
   - **Packages and scopes:** Read and Write access to `@theoparashkevov`
   - **Expiration:** Set to something reasonable (e.g., 90 days) and rotate periodically
3. **Copy the token** (starts with `npm_...`)
4. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
5. Click **New repository secret**
   - Name: `NPM_TOKEN`
   - Value: paste your token
6. Click **Add secret**

#### Step 2: Grant Actions write permissions

1. GitHub repo → **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select:
   - ✅ **Read and write permissions**
3. Click **Save**

This allows the release workflow to create GitHub Releases.

#### Step 3: Publish a release (automated)

From your local machine:

```bash
# Bump version and create git tag
npm version patch   # or minor / major

# Push tag — this triggers the release workflow
git push --follow-tags
```

That's it. The GitHub Action will:
1. Check out the code
2. Install Bun and dependencies
3. Type check and run tests
4. Build the bundle
5. Publish `@theoparashkevov/opencode-talk@x.y.z` to npm
6. Create a GitHub Release with auto-generated release notes

You can monitor progress in the **Actions** tab of your GitHub repo.

---

## Versioning strategy

We follow [SemVer](https://semver.org/):

| Bump | When |
|------|------|
| **Patch (x.y.Z)** | Bug fixes, docs updates, performance improvements |
| **Minor (x.Y.0)** | New feature, backward compatible (new provider, new setting) |
| **Major (X.0.0)** | Breaking change to public API (interface changes, removed settings) |

### Public API surface

For SemVer purposes, "breaking" means changes to:
- `TranscriptionProvider` interface
- `AudioRecorder` interface
- `TalkConfig` interface
- `index.js` default export shape (`{ id, tui }`)
- KV key names (changing them resets user settings)

Internal implementation details can change in minors.

---

## Troubleshooting

### "You may not perform that action with these credentials"

Your npm token does not have publish permission for the scope. Solutions:
- Use a **granular token** scoped to `@theoparashkevov` with **Publish** permission
- Or use a **classic token** with **Publish** permission
- Verify your email is confirmed on npm

### Package not found after publishing

npm's search index takes 2–5 minutes to update. The package is installable immediately via:
```bash
npm install @theoparashkevov/opencode-talk@latest
```

### "Tag already exists" during `npm version`

You already have a git tag for that version. Either:
- Delete the tag: `git tag -d v1.0.1 && git push origin :refs/tags/v1.0.1`
- Or bump to a different version

### CI fails on tests but passes locally

The CI runner is Ubuntu and may not have `ffmpeg`. Our tests mock audio capture, but if you add integration tests, ensure they don't require actual system tools in CI.
