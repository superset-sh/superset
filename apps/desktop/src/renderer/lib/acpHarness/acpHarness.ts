/**
 * Preset id — not a config id — to the harness that runs it as a chat. The two
 * are different spaces: a config id is a per-user UUID, and every lookup here
 * takes the preset the config was built from.
 *
 * Mirrors the harnesses the host registers. An agent listed here that the host
 * cannot run is worse than an omission: its terminal is replaced by a chat
 * whose session never starts.
 */
const ACP_HARNESS_BY_PRESET: Record<string, string> = {
	claude: "claude-acp",
	codex: "codex-acp",
	opencode: "opencode-acp",
	pi: "pi-acp",
};

export function acpHarnessForPreset(
	presetId: string | null | undefined,
): string | undefined {
	return presetId ? ACP_HARNESS_BY_PRESET[presetId] : undefined;
}

export function presetForAcpHarness(harness: string): string | undefined {
	return Object.entries(ACP_HARNESS_BY_PRESET).find(
		([, candidate]) => candidate === harness,
	)?.[0];
}
