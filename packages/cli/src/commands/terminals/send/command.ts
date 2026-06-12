import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Send input to a running terminal session",
	args: [positional("id").required().desc("Terminal ID")],
	options: {
		workspace: string().required().desc("Workspace ID that owns the terminal"),
		text: string().required().desc("Text to write to the terminal"),
		enter: boolean().desc("Append a carriage return so the input is submitted"),
		host: string().desc("Skip the cloud lookup and target this host directly"),
		local: boolean().desc("Skip the cloud lookup and target this machine"),
	},
	run: async ({ ctx, args, options }) => {
		const terminalId = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		let hostId = resolveHostFilter({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		if (!hostId) {
			const cloudWorkspace = await ctx.api.v2Workspace.getFromHost.query({
				organizationId,
				id: options.workspace,
			});
			if (!cloudWorkspace) {
				throw new CLIError(`Workspace not found: ${options.workspace}`);
			}
			hostId = cloudWorkspace.hostId;
		}

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		// `text` is written verbatim; `--enter` appends a carriage return so a
		// shell command actually runs instead of just sitting on the prompt.
		const data = options.enter ? `${options.text}\r` : options.text;
		await target.client.terminal.writeInput.mutate({
			terminalId,
			workspaceId: options.workspace,
			data,
		});

		return { message: `Sent input to terminal ${terminalId}` };
	},
});
