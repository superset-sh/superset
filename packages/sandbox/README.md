# Superset Cloud Sandbox

Modal-based execution environment for Superset cloud workspaces.

## Overview

This package provides the sandbox infrastructure that runs in Modal:

- **Sandbox Class** - Modal container that executes Claude Code with git workspace
- **API Endpoints** - HTTP endpoints for control plane communication
- **Event Streaming** - Real-time events sent back to control plane

## Setup

### Prerequisites

1. [Modal account](https://modal.com) and CLI installed
2. GitHub App or Personal Access Token for repo access
3. Anthropic API key for Claude

### Configure Secrets

Create Modal secrets:

```bash
# Modal API secret (shared with control plane)
modal secret create superset-modal-secrets \
  MODAL_API_SECRET=your-shared-secret \
  GITHUB_TOKEN=ghp_... \
  ANTHROPIC_API_KEY=sk-ant-...
```

### Deploy

```bash
cd packages/sandbox
modal deploy sandbox/app.py
```

## Architecture

```
Control Plane (Cloudflare Workers)
        │
        ├── POST /api/sessions/:id/spawn-sandbox
        │   └── Creates Modal sandbox instance
        │
        ▼
Modal Sandbox
        │
        ├── Clone repository
        ├── Setup git branch
        ├── Execute Claude Code prompts
        └── Stream events back to control plane
```

## API Endpoints

All endpoints are authenticated via HMAC-signed Bearer tokens.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api-create-sandbox` | POST | Create new sandbox |
| `/api-warm-sandbox` | POST | Pre-warm container |
| `/api-terminate-sandbox` | POST | Terminate sandbox |
| `/api-snapshot-sandbox` | POST | Create snapshot |
| `/api-restore-sandbox` | POST | Restore from snapshot |
| `/api-health` | GET | Health check |

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run locally (with Modal dev server)
modal serve sandbox/app.py

# Type check
mypy sandbox

# Lint
ruff check sandbox
```
