import { boolean, CLIError, string } from "@superset/cli-framework";
import { explainAgent } from "../../../lib/agent-explain";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";

export default command({
	description:
		"Explain why an agent shows as starting, working, blocked, idle or exited",
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
		const client = target.client;
		const ref = {
			workspaceId: options.workspace,
			terminalId: options.terminal,
		};

		const [binding, { sessions }, process] = await Promise.all([
			// Hosts before `terminalAgents.get` only list live agents.
			client.terminalAgents.get.query(ref).catch(async () => {
				const live = await client.terminalAgents.listByWorkspace.query({
					workspaceId: options.workspace,
				});
				return live.find((row) => row.terminalId === options.terminal) ?? null;
			}),
			client.terminal.list.query({ workspaceId: options.workspace }),
			client.terminal.hasRunningProcess.query(ref).catch(() => ({
				running: false,
			})),
		]);
		const explanation = explainAgent({
			binding,
			terminalAlive: sessions.some(
				(session) => session.terminalId === options.terminal,
			),
			processRunning: process.running,
			now: Date.now(),
		});
		return {
			data: {
				terminalId: options.terminal,
				...explanation,
				lastEventType: binding?.lastEventType ?? null,
				lastEventAt: binding?.lastEventAt ?? null,
			},
			message: [
				explanation.state === "none"
					? `No agent in terminal ${options.terminal}.`
					: `${binding?.agentId ?? "The agent"} is ${explanation.state}.`,
				`Why: ${explanation.because}.`,
				...explanation.details,
			].join("\n"),
		};
	},
});
