/**
 * Brand marks for agent presets, rendered from the same SVG catalog desktop
 * uses (packages/ui preset-icons, dark variants — the app is dark-only).
 * Keyed by presetId / iconId from the host's `settings.agentConfigs`.
 */
export const AGENT_ICONS: Record<string, number> = {
	amp: require("@/assets/agents/amp.png"),
	claude: require("@/assets/agents/claude.png"),
	codex: require("@/assets/agents/codex.png"),
	copilot: require("@/assets/agents/copilot.png"),
	"cursor-agent": require("@/assets/agents/cursor-agent.png"),
	"cursor-composer": require("@/assets/agents/cursor-agent.png"),
	droid: require("@/assets/agents/droid.png"),
	gemini: require("@/assets/agents/gemini.png"),
	grok: require("@/assets/agents/grok.png"),
	kimi: require("@/assets/agents/kimi.png"),
	mastracode: require("@/assets/agents/mastracode.png"),
	opencode: require("@/assets/agents/opencode.png"),
	pi: require("@/assets/agents/pi.png"),
	polygraph: require("@/assets/agents/polygraph.png"),
	superset: require("@/assets/agents/superset.png"),
	vibe: require("@/assets/agents/vibe.png"),
};

export function agentIconSource(agentId: string): number | undefined {
	return AGENT_ICONS[agentId.toLowerCase().trim()];
}
