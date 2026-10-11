import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { waitForAgent } from "../../../lib/agent-binding";
import { AGENT_WAIT_TARGETS, agentWaitState } from "../../../lib/agent-wait";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";

export default command({
	description:
		"Block until an agent reaches a state: settled (finished its turn or needs input), idle, blocked, or working",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string()
			.required()
			.desc(
				"Terminal ID the agent runs in (the sessionId `agents create` returned)",
			),
		until: string()
			.enum(...AGENT_WAIT_TARGETS)
			.default("settled")
			.desc("State to wait for"),
		timeout: number().min(1).default(600).desc("Seconds before giving up"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { target } = await resolveWorkspaceTarget(
			{
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			options.workspace,
		);

		const { observation, timedOut } = await waitForAgent({
			client: target.client,
			ref: { workspaceId: options.workspace, terminalId: options.terminal },
			until: options.until,
			timeoutMs: options.timeout * 1000,
		});
		const state = agentWaitState(observation);
		if (state === "exited") {
			throw new CLIError(
				`No agent is running in terminal ${options.terminal}`,
				"It exited, or the terminal was closed",
			);
		}
		if (timedOut) {
			throw new CLIError(
				`Timed out after ${options.timeout}s; agent is ${state}`,
				"Raise --timeout, or check it with `superset terminals read`",
			);
		}
		return {
			data: {
				terminalId: options.terminal,
				state,
				lastEventType: observation.binding?.lastEventType ?? null,
			},
			message: `Agent in terminal ${options.terminal} is ${state}`,
		};
	},
});
