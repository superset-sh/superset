import { CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveEnvironment } from "../../../../lib/environments";

export default command({
	description: "List an environment's variables; values are never shown",
	options: {
		environment: string().desc(
			"Environment (id or name); required when the organization has several",
		),
	},
	display: (data) =>
		table(
			(data as { secrets: Record<string, unknown>[] }).secrets ?? [],
			["key", "visibility", "updatedAt"],
			["NAME", "VISIBILITY", "UPDATED"],
			[48, 10, 24],
		),
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const environment = await resolveEnvironment(
			ctx.api,
			organizationId,
			options.environment,
		);
		const rows = await ctx.api.environment.secrets.list.query({
			environmentId: environment.id,
		});
		return {
			data: {
				environment: { id: environment.id, name: environment.name },
				secrets: rows.map((row) => ({
					key: row.key,
					visibility: row.sensitive ? "secret" : "visible",
					updatedAt: row.updatedAt.toISOString(),
				})),
			},
		};
	},
});
