# User Configuration (~/.superset-cli.json)

The Superset CLI supports a user configuration file at `~/.superset-cli.json` for customizing agent launch commands and other settings.

## Configuration Structure

```json
{
  "launchers": {
    "claude": "claude",
    "codex": "codex",
    "cursor": "cursor"
  }
}
```

## Launcher Configuration

The `launchers` section allows you to override the default launch commands for each agent type.

### Priority Order

Launch commands are resolved in the following order (highest to lowest priority):

1. **Agent's stored launchCommand** - Set on the agent instance itself
2. **Environment variable** - `SUPERSET_AGENT_LAUNCH_<TYPE>` (e.g., `SUPERSET_AGENT_LAUNCH_CLAUDE`)
3. **User config file** - `~/.superset-cli.json` launchers section
4. **Default command** - Built-in defaults (claude, codex, cursor)

### Examples

**Custom Claude command:**
```json
{
  "launchers": {
    "claude": "/usr/local/bin/my-custom-claude-wrapper"
  }
}
```

**Custom paths for all agents:**
```json
{
  "launchers": {
    "claude": "/opt/claude/bin/claude",
    "codex": "~/bin/codex-wrapper",
    "cursor": "cursor --verbose"
  }
}
```

**Using environment-specific wrappers:**
```json
{
  "launchers": {
    "claude": "env ANTHROPIC_API_KEY=sk-... claude",
    "codex": "docker run --rm -it openai/codex"
  }
}
```

## Environment Variables

You can also use environment variables to override launch commands without modifying the config file:

```bash
export SUPERSET_AGENT_LAUNCH_CLAUDE="claude --debug"
export SUPERSET_AGENT_LAUNCH_CODEX="/usr/local/bin/codex"
export SUPERSET_AGENT_LAUNCH_CURSOR="cursor --no-sandbox"
```

These environment variables take precedence over the user config file but are superseded by agent-specific launch commands.

## Best Practices

1. **Use absolute paths** when specifying custom commands to avoid PATH issues
2. **Test commands** independently before adding them to the config
3. **Keep it simple** - avoid complex shell scripts in the config; use wrapper scripts instead
4. **Version control** - Consider checking a template config file into your project's repository
5. **Security** - Never store API keys or secrets in the config file; use environment variables instead

## Troubleshooting

If an agent fails to launch:

1. Check if the command exists: `which <command>`
2. Test the command directly in a terminal
3. Check the agent logs for error messages
4. Verify the config file is valid JSON: `cat ~/.superset-cli.json | jq .`
5. Remove the config file temporarily to test with defaults

## Related

- See `apps/cli/src/lib/config/user-config.ts` for implementation details
- See `apps/cli/src/lib/launch/config.ts` for launch command resolution logic
