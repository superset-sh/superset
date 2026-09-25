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
	/**
	 * Cloud uploads the agent is launched with. A sandbox has no host to write
	 * them to at create time, so the ids travel and the box pulls the bytes
	 * itself once host-service is up.
	 */
	attachmentFileIds?: string[];
}

/**
 * The presets a sandbox can actually run: the CLIs the image installs
 * (`packages/sandbox/src/image.ts`, AGENT_CLI_VERSIONS). Adding one there is what
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
	attachments: "SUPERSET_SANDBOX_AGENT_ATTACHMENTS",
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
		...(launch.attachmentFileIds?.length
			? { [ENV.attachments]: launch.attachmentFileIds.join(",") }
			: {}),
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
		attachmentFileIds: splitAttachmentIds(env[ENV.attachments]),
	};
}

function splitAttachmentIds(value: string | undefined): string[] | undefined {
	const ids = (value ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	return ids.length > 0 ? ids : undefined;
}

/**
 * What the agent is asked to do when an environment is created with "Start
 * agent": onboard the checkout so a golden can be promoted from the result.
 * The person watches in the terminal and desktop and can take over.
 */
export const ENVIRONMENT_ONBOARDING_PROMPT = [
	"You are setting up this repository so a cloud workspace can start from it.",
	"Work in the checkout you are in. Read its README, package manifests, lockfiles and any existing `.superset/config.json`.",
	"Install what a developer needs to run the project (dependencies, toolchains, databases as services), then verify the project builds and its tests or dev server run.",
	"Write `.superset/config.json` with `setup` (what you just did, as commands that can rerun on a fresh checkout), `start` (the services a workspace needs on every boot) and, if the project serves anything, `ports`.",
	"If a step needs a secret you do not have, stop and list exactly which variables are required and where they are read; do not invent values.",
	"When everything runs, summarize what you installed, what the hooks do, and what secrets the environment needs, then stop.",
].join(" ");
