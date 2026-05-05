import { joinCommandArgs } from "./argv";

/**
 * Build the shell command string used to launch an agent without a prompt
 * (e.g. when triggered from a v2 terminal preset). Includes always-on `args`
 * but omits `promptArgs` and `promptTransport` — those only apply when a
 * prompt is being delivered. Mirrors the launch resolution documented in
 * `packages/shared/src/host-agent-presets.ts`.
 */
export function buildAgentLaunchCommand(agent: {
	command: string;
	args: string[];
}): string {
	return joinCommandArgs(agent.command, agent.args);
}
