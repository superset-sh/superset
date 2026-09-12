import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	requireHostTarget,
	resolveHostTarget,
} from "../../../../lib/host-target";

export default command({
	description: "Remove an agent preset from a host",
	args: [
		positional("id")
			.required()
			.desc("Agent config id from `superset agents list`"),
	],
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		await target.client.settings.agentConfigs.remove.mutate({ id });

		return {
			data: { id },
			message: `Removed agent ${id}`,
		};
	},
});
