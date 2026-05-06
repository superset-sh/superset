import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 60_000;
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?$/;

export default command({
	description: "Trigger a remote update on a host you own",
	args: [positional("machineId").required().desc("Host machine id")],
	options: {
		version: string().desc(
			"Install a specific CLI version (e.g. 0.2.7). Subject to the org's minimum-allowed version policy.",
		),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const machineId = args.machineId as string;

		const targetVersion = options.version?.replace(/^cli-v/, "");
		if (targetVersion && !SEMVER_RE.test(targetVersion)) {
			throw new CLIError(
				`Invalid --version: ${options.version}`,
				"Expected a semver like 0.2.7 (or cli-v0.2.7).",
			);
		}

		const result = await ctx.api.host.update.mutate({
			organizationId,
			machineId,
			targetVersion,
		});

		if (result.outcome === "satisfied") {
			return {
				data: result,
				message: `Already on ${result.previousVersion ?? "current"} — no update needed.`,
			};
		}

		const startedAt = Date.now();
		while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			const rows = await ctx.api.host.list.query({ organizationId });
			const host = rows.find((row) => row.id === machineId);
			if (host?.online) {
				return {
					data: { ...result, online: true },
					message: targetVersion
						? `Update dispatched. Host back online on ${targetVersion}.`
						: "Update dispatched. Host back online on latest.",
				};
			}
		}

		return {
			data: { ...result, online: false },
			message: `Update dispatched. Host has not come back online within ${POLL_TIMEOUT_MS / 1000}s. Check ~/.superset/host/<orgId>/update.log on the host.`,
		};
	},
});
