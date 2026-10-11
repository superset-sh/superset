import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import { explainAgent } from "./explain-agent";

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

		const [live, { sessions }, processRunning] = await Promise.all([
			client.terminalAgents.listByWorkspace.query({
				workspaceId: options.workspace,
			}),
			client.terminal.list.query({ workspaceId: options.workspace }),
			client.terminal.hasRunningProcess
				.query(ref)
				.then((result) => result.running)
				.catch(() => null),
		]);
		// The live row carries subagents and queued prompts; the saved row from
		// `terminalAgents.get` is only needed for a session that has ended.
		const binding =
			live.find((row) => row.terminalId === options.terminal) ??
			(await client.terminalAgents.get.query(ref).catch((error: unknown) => {
				if (
					error instanceof Error &&
					/No procedure found on path "?terminalAgents\.get/.test(error.message)
				) {
					return null;
				}
				throw error;
			}));
		const explanation = explainAgent({
			binding,
			terminalAlive: sessions.some(
				(session) => session.terminalId === options.terminal,
			),
			processRunning,
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
				explanation.headline,
				`Why: ${explanation.because}.`,
				...explanation.details,
			].join("\n"),
		};
	},
});
