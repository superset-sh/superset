# Autohand CLI Integration Design

## Goal

Add native support for Autohand Code CLI (`autohand`) to Superset, following the same integration patterns used by Codex, Gemini, and Mastra. Full feature parity: agent type, config-based hooks, shell wrapper, shell shim, SVG icons, UI preset, and MCP config.

## Decisions

- **Hook style:** Config-based hooks via `~/.autohand/config.json` (Mastra pattern)
- **Danger mode:** `--unrestricted` flag (no approval prompts)
- **Task command:** `autohand --unrestricted -p` + heredoc prompt
- **Shell shim:** Yes, add to `SHIMMED_BINARIES`
- **MCP config:** Project-level `.autohand/config.json` + commands symlink

## Integration Points

### 1. Agent Type (`packages/shared/src/agent-command.ts`)

- Add `"autohand"` to `AGENT_TYPES`
- `AGENT_LABELS`: `"Autohand"`
- `AGENT_PRESET_COMMANDS`: `["autohand --unrestricted"]`
- `AGENT_PRESET_DESCRIPTIONS`: `"Danger mode: All permissions auto-approved"`
- `AGENT_COMMANDS` builder: `autohand --unrestricted -p` + heredoc

### 2. Hook Config Writer (`apps/desktop/.../agent-wrappers-autohand.ts`)

New file following Mastra pattern. Reads/merges `~/.autohand/config.json`:

```json
{
  "hooks": {
    "enabled": true,
    "hooks": [
      { "event": "pre-prompt", "command": "bash '/path/notify.sh'", "enabled": true },
      { "event": "stop", "command": "bash '/path/notify.sh'", "enabled": true },
      { "event": "post-tool", "command": "bash '/path/notify.sh'", "enabled": true }
    ]
  }
}
```

Event mapping:
- Superset `UserPromptSubmit` -> Autohand `pre-prompt`
- Superset `Stop` -> Autohand `stop`
- Superset `PostToolUse` -> Autohand `post-tool`

Merge logic preserves all non-hook config (provider, workspace, ui, permissions).

### 3. Shell Wrapper

Simple exec passthrough (like Gemini): `exec "$REAL_BIN" "$@"`

### 4. Shell Shim

Add `"autohand"` to `SHIMMED_BINARIES` in `shell-wrappers.ts`.

### 5. UI Icons

Create `autohand.svg` and `autohand-white.svg` in preset-icons. Register in `PRESET_ICONS` map.

### 6. UI Preset

Add `"autohand"` to `DEFAULT_PRESET_AGENTS` in settings router.

### 7. MCP Config (Project-level)

Create `.autohand/config.json` at project root with MCP servers matching `.mcp.json`:

```json
{
  "mcp": {
    "servers": [
      { "name": "superset", "transport": "http", "url": "https://api.superset.sh/api/agent/mcp" },
      { "name": "neon", "transport": "http", "url": "https://mcp.neon.tech/mcp" },
      { "name": "linear", "transport": "http", "url": "https://mcp.linear.app/mcp" },
      { "name": "sentry", "transport": "http", "url": "https://mcp.sentry.dev/mcp" },
      { "name": "maestro", "transport": "stdio", "command": "maestro", "args": ["mcp"] },
      { "name": "desktop-automation", "transport": "stdio", "command": "bun", "args": ["run", "packages/desktop-mcp/src/bin.ts"] }
    ]
  }
}
```

Create `.autohand/commands` symlink -> `../.agents/commands`.

### 8. Tests

Add to `agent-wrappers.test.ts`:
- Hook merge preserves user config
- Stale hook replacement
- Wrapper creation

## Commit Plan

1. Add autohand agent type to shared package
2. Create autohand hook config writer + wrapper
3. Wire up in agent-setup index + shell shims
4. Add SVG icons + register in preset-icons
5. Add to default presets in settings router
6. Add project-level MCP config + commands symlink
7. Add tests
