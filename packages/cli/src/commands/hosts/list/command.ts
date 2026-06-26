import { CLIError, table } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { isProcessAlive, readManifest } from "../../../lib/host/manifest";

export default command({
	description: "List hosts accessible to you in the active organization",
	run: async ({ ctx }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const rows = await ctx.api.host.list.query({ organizationId });
		const localHostId = getHostId();
		const data = rows.map((row) => ({
			id: row.id,
			name: row.name,
			online: row.online ? "yes" : row.id === localHostId ? "local" : "no",
		}));

		const tableText = table(
			data,
			["name", "online", "id"],
			["NAME", "ONLINE", "ID"],
		);

		// A healthy local host serves the desktop app directly but only shows up
		// here once it registers to the cloud relay. When the cloud list doesn't
		// include the running local host, make the empty/partial result legible
		// instead of returning a bare "No results." that looks like broken auth
		// or the wrong org (see #5059).
		const manifest = readManifest(organizationId);
		const localRunning = manifest !== null && isProcessAlive(manifest.pid);
		const localRegistered = rows.some((row) => row.id === localHostId);

		if (localRunning && !localRegistered) {
			const hint = [
				`A host service is running locally (hostId ${localHostId.slice(0, 8)}…)`,
				"but is not registered to this organization in the cloud.",
				"It serves the desktop app directly and will appear here once it",
				"connects to the cloud relay (which may require a paid plan).",
			].join(" ");
			return { data, message: `${tableText}\n\n${hint}` };
		}

		return { data, message: tableText };
	},
});
