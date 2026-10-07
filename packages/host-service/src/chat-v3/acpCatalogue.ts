type AcpTranslator =
	| { adapter: string; executableEnv: string }
	| { adapter?: undefined; executableEnv?: undefined };

export type AcpHarness = {
	registryId: string;
	binary: string;
	args: string[];
	minVersion: string;
	upgrade?: string;
	/** The agent's own id for its unrestricted mode; chats start in it. */
	fullAccessModeId?: string;
	note: string;
} & AcpTranslator;

export const UNGATED_VERSION = "0.0.0";

export const ACP_HARNESSES: Record<string, AcpHarness> = {
	"claude-acp": {
		registryId: "claude-acp",
		binary: "claude",
		args: [],
		minVersion: "2.1.226",
		adapter: "@agentclientprotocol/claude-agent-acp",
		executableEnv: "CLAUDE_CODE_EXECUTABLE",
		upgrade: "npm i -g @anthropic-ai/claude-code@latest",
		fullAccessModeId: "bypassPermissions",
		note: "2.1.226 verified against adapter 0.85.0: session/new returns the same modes and configOptions as 2.1.286.",
	},
	"codex-acp": {
		registryId: "codex-acp",
		binary: "codex",
		args: [],
		minVersion: "0.160.0",
		adapter: "@agentclientprotocol/codex-acp",
		executableEnv: "CODEX_PATH",
		upgrade: "npm i -g @openai/codex@latest",
		fullAccessModeId: "agent-full-access",
		note: "Conservative: the adapter drives `codex app-server`, and the release that introduced it is not pinned. The native codex adapter's MIN_CODEX_VERSION is 0.143.0, so this floor is probably lowerable once app-server is verified against an older build.",
	},
	"gemini-acp": {
		registryId: "gemini",
		binary: "gemini",
		args: ["--acp"],
		minVersion: "0.62.0",
		upgrade: "npm i -g @google/gemini-cli@latest",
		note: "Conservative. `--acp` replaced `--experimental-acp`, and the rename release is not pinned beyond being above 0.20.0, which defined only the experimental spelling. Sending `--acp` to a CLI that predates it prints usage and exits 0, which reads as a crash, so the floor errs high.",
	},
	"opencode-acp": {
		registryId: "opencode",
		binary: "opencode",
		args: ["acp"],
		minVersion: "1.15.5",
		upgrade: "npm i -g opencode-ai@latest",
		note: "1.15.5 verified: initialize reports OpenCode 1.15.5 and session/new returns a session with model options.",
	},
	"pi-acp": {
		registryId: "pi-acp",
		binary: "pi",
		args: [],
		minVersion: UNGATED_VERSION,
		adapter: "pi-acp",
		executableEnv: "PI_ACP_PI_COMMAND",
		note: "Ungated: no pi install was available to verify a floor against, and gating on a guess would reject working versions. It reached the same state before this catalogue, since the harness resolved pi off PATH either way.",
	},
};

/**
 * The floor for a CLI, by the harness that documents it. The non-ACP harnesses
 * drive the same binaries, so they gate on the same versions.
 */
export function cliFloor(harness: string): {
	minVersion: string;
	upgrade?: string;
} {
	const entry = ACP_HARNESSES[harness];
	return {
		minVersion: entry?.minVersion ?? UNGATED_VERSION,
		upgrade: entry?.upgrade,
	};
}

const ACP_HARNESS_BY_PRESET: Record<string, string> = {
	claude: "claude-acp",
	codex: "codex-acp",
	opencode: "opencode-acp",
	pi: "pi-acp",
};

export function acpHarnessForPreset(presetId: string): string | undefined {
	return ACP_HARNESS_BY_PRESET[presetId];
}
