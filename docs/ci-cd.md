# CI/CD Pipeline

This document describes the automated testing and release pipeline for opencode-talk.

---

## Overview

All CI/CD is handled by **GitHub Actions** — no external services needed.

```
Push to main / Pull Request
           │
           ▼
    ┌──────────────┐
    │   CI Job     │  ← .github/workflows/ci.yml
    │              │
    │  • bun install
    │  • bun run typecheck
    │  • bun test
    │  • bun run bundle
    └──────────────┘
           │
           └─→ Green checkmark on PR / commit status

Push tag v* (e.g., v1.0.1)
           │
           ▼
    ┌──────────────┐
    │ Release Job  │  ← .github/workflows/release.yml
    │              │
    │  • Run full CI suite
    │  • bun run bundle
    │  • npm publish --access public
    │  • Create GitHub Release
    └──────────────┘
           │
           ├─→ Package on npm registry
           └─→ GitHub Release with changelog
```

---

## Workflows

### `ci.yml` — Continuous Integration

**Triggers:** every push to `main`, every pull request targeting `main`

**What it does:**
1. Checks out the code
2. Sets up Bun runtime
3. Installs dependencies (`bun install`)
4. Type-checks TypeScript (`bun run typecheck`)
5. Runs all tests (`bun test`)
6. Builds the production bundle (`bun run bundle`)

**Why it matters:** Catches type errors, test failures, and build breaks before they reach `main`.

### `release.yml` — Release & Publish

**Triggers:** only when you push a git tag matching `v*` (e.g., `v1.0.1`, `v2.0.0`)

**What it does:**
1. Runs the full CI suite (same as `ci.yml`)
2. Bundles the plugin into `dist/index.js`
3. Publishes to npm registry (`npm publish --access public`)
4. Creates a GitHub Release with auto-generated release notes

**Why it matters:** One command (`git push --follow-tags`) triggers the entire release process. No manual npm login, no copy-paste, no forgotten steps.

---

## Required secrets

The release workflow needs one secret configured in your GitHub repository:

| Secret | What it's for | Where to get it |
|--------|---------------|-----------------|
| `NPM_TOKEN` | Authenticate with npm registry to publish the package | npmjs.com → Access Tokens → copy your publish token |

### How to add the secret

1. Go to **[npmjs.com](https://www.npmjs.com)** → **Access Tokens**
2. Copy your **granular token** with **Publish** permission for `@theoparashkevov`
3. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Name: `NPM_TOKEN`
6. Value: paste your token
7. Click **Add secret**

### Permissions required

The `release.yml` workflow also needs permission to create GitHub Releases. Ensure this is set:

1. GitHub repo → **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select **Read and write permissions**
3. Click **Save**

---

## How to cut a release

### Step 1: Make sure everything is on `main`

```bash
git checkout main
git pull origin main
```

### Step 2: Bump the version

```bash
# Patch: bug fixes
npm version patch      # 1.0.0 → 1.0.1

# Minor: new features
npm version minor      # 1.0.0 → 1.1.0

# Major: breaking changes
npm version major      # 1.0.0 → 2.0.0
```

This:
- Updates `package.json` version
- Creates a git tag (e.g., `v1.0.1`)
- Commits both changes automatically

### Step 3: Push the tag

```bash
git push --follow-tags
```

That's it. The GitHub Action will:
- Run tests
- Publish `@theoparashkevov/opencode-talk@1.0.1` to npm
- Create a GitHub Release at `https://github.com/theoparashkevov/opencode-talk/releases/tag/v1.0.1`

### Step 4: Monitor

Go to your GitHub repo → **Actions** tab to watch the release job run. It takes about 1–2 minutes.

---

## Example release flow

```bash
# Fix a bug
vim src/audio/recorder.ts
git add .
git commit -m "fix: handle SIGKILL edge case on Linux"
git push origin main

# CI passes (green checkmark on commit)

# Cut a release
npm version patch
git push --follow-tags

# GitHub Actions runs automatically:
# → Tests pass
# → Published to npm: @theoparashkevov/opencode-talk@1.0.1
# → GitHub Release created with changelog
```

---

## What happens if something fails?

### CI fails on a PR

The PR shows a red checkmark. Fix the issue, push again, and the CI re-runs.

### Release fails after pushing a tag

1. Check the **Actions** tab for the error
2. Common causes:
   - `NPM_TOKEN` secret is missing or expired
   - npm token doesn't have publish permission
   - Tests failed (the release job runs tests too)
3. Fix the issue
4. Delete the failed tag and recreate:
   ```bash
   git tag -d v1.0.1
   git push origin :refs/tags/v1.0.1
   npm version patch  # creates new tag
   git push --follow-tags
   ```

### npm publish succeeds but GitHub Release fails

The package is on npm. You can create the GitHub Release manually if needed, or delete the tag and re-push to trigger the workflow again.

---

## Local testing of workflows

If you want to test workflow changes without pushing to GitHub:

### Simulate CI locally

```bash
# Same commands the CI runs:
bun install
bun run typecheck
bun test
bun run bundle
```

### Test the release bundle

```bash
bun run bundle
# Verify dist/index.js exists and is ~220KB
ls -lh dist/index.js
```
