import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	confirmByName,
	promoteWorkspace,
	resolveEnvironment,
} from "../../../lib/environments";

export default command({
	sandbox: false,
	description:
		"Replace an environment's snapshot with a ready cloud workspace, keeping its name and variables; restarts the workspace",
	args: [positional("environment").required().desc("Environment ID")],
	options: {
		workspace: string().required().desc("Cloud workspace ID"),
		scope: string()
			.enum("organization", "personal")
			.desc("Also change who can use it"),
		yes: boolean().desc("Replace without asking; required without a terminal"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const { id } = await resolveEnvironment(
			ctx.api,
			organizationId,
			args.environment as string,
		);
		const environment = await ctx.api.environment.get.query({ id });
		await confirmByName({
			name: environment.name,
			consequence: `Replacing ${environment.name} deletes the snapshot its new workspaces fork from and cannot be undone`,
			yes: options.yes,
			rerun: `superset environments replace ${environment.id} --workspace ${options.workspace}`,
		});
		const saved = await promoteWorkspace({
			api: ctx.api,
			organizationId,
			workspaceId: options.workspace,
			into: { environment },
			scope: options.scope,
		});
		return {
			data: saved,
			message: `Replaced ${saved.name} (${saved.id}); new workspaces on it fork from ${saved.sourceRef}`,
		};
	},
});
