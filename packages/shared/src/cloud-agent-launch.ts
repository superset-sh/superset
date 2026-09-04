import { HOST_AGENT_PRESETS } from "./host-agent-presets";

/**
 * What a cloud workspace launches on first boot: a built-in agent and its
 * prompt. The API validates it, provisioning hands it to the sandbox as
 * environment, and host-service runs it the way a local host runs an agent
 * for a new workspace. Custom agents follow once they live in the cloud
 * (SUPER-2127); until then only the built-in presets are launchable here.
 */
export interface CloudAgentLaunch {
	agent: string;
	prompt: string;
	model?: string;
	effort?: string;
	mode?: string;
}

/**
 * The presets a sandbox can actually run: the CLIs the image installs
 * (`scripts/sandbox/image.ts`, AGENT_CLI_VERSIONS). Adding one there is what
 * makes it launchable here.
 */
const INSTALLED_IN_SANDBOX = new Set(["claude", "codex"]);

export const CLOUD_AGENT_IDS: readonly string[] = HOST_AGENT_PRESETS.filter(
	(preset) => INSTALLED_IN_SANDBOX.has(preset.presetId),
).map((preset) => preset.presetId);

export function isCloudAgentId(id: string): boolean {
	return CLOUD_AGENT_IDS.includes(id);
}

const ENV = {
	agent: "SUPERSET_SANDBOX_AGENT",
	prompt: "SUPERSET_SANDBOX_AGENT_PROMPT",
	model: "SUPERSET_SANDBOX_AGENT_MODEL",
	effort: "SUPERSET_SANDBOX_AGENT_EFFORT",
	mode: "SUPERSET_SANDBOX_AGENT_MODE",
} as const;

/** Every variable the launch travels in; stripped when a sandbox is promoted. */
export const CLOUD_AGENT_LAUNCH_ENV_NAMES: readonly string[] =
	Object.values(ENV);

export function cloudAgentLaunchToEnv(
	launch: CloudAgentLaunch | undefined,
): Record<string, string> {
	if (!launch) return {};
	return {
		[ENV.agent]: launch.agent,
		[ENV.prompt]: launch.prompt,
		...(launch.model ? { [ENV.model]: launch.model } : {}),
		...(launch.effort ? { [ENV.effort]: launch.effort } : {}),
		...(launch.mode ? { [ENV.mode]: launch.mode } : {}),
	};
}

export function readCloudAgentLaunch(
	env: Record<string, string | undefined>,
): CloudAgentLaunch | null {
	const agent = env[ENV.agent];
	if (!agent) return null;
	return {
		agent,
		prompt: env[ENV.prompt] ?? "",
		model: env[ENV.model] || undefined,
		effort: env[ENV.effort] || undefined,
		mode: env[ENV.mode] || undefined,
	};
}
