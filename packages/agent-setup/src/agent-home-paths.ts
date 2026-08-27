/**
 * Home-relative paths each supported agent CLI reads config/auth/hooks from.
 * Owned here, next to the wrapper writers that target the same locations, so
 * consumers (the workspace sandbox mounts host agent config into containers
 * from this list) track new agents automatically instead of keeping a
 * parallel hardcoded list.
 *
 * Keep entries in sync with the corresponding agent-wrappers-*.ts writer.
 * fs-free on purpose — see agent-setup-targets.ts for the same convention.
 */
export const AGENT_HOME_CONFIG_PATHS: readonly string[] = [
	// claude (agent-wrappers-claude-codex-opencode.ts)
	".claude",
	".claude.json",
	// codex
	".codex",
	// opencode: XDG config + auth.json under XDG data
	".config/opencode",
	".local/share/opencode",
	// gemini (agent-wrappers-gemini.ts)
	".gemini",
	// amp (agent-wrappers-amp.ts)
	".config/amp",
	// copilot
	".copilot",
	// mastracode (agent-wrappers-mastra.ts)
	".mastracode",
	// droid / Factory (agent-wrappers-droid.ts)
	".factory",
	// kimi (agent-wrappers-kimi.ts)
	".kimi-code",
	// grok (agent-wrappers-grok.ts)
	".grok",
	// vibe (agent-wrappers-vibe.ts)
	".vibe",
	// pi + oh-my-pi (agent-wrappers-pi.ts / agent-wrappers-omp.ts)
	".pi",
	".omp",
	// cursor-agent (agent-wrappers-cursor.ts)
	".cursor",
];
