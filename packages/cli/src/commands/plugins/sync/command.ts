import { table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { skillsRoot } from "../../../lib/plugins/host";
import { syncPlugins } from "../../../lib/plugins/install";
import { reconcileOrganizationPlugins } from "../../../lib/plugins/organization";
import { resolveAuth } from "../../../lib/resolve-auth";

/** Signed out or offline, the local plugins still sync; only the organization's go unchecked. */
async function organizationChanges(): Promise<string> {
	try {
		const { api } = await resolveAuth(undefined);
		const { installed, removed, failed } =
			await reconcileOrganizationPlugins(api);
		return [
			installed.length
				? ` Organization plugins updated: ${installed.join(", ")}.`
				: "",
			removed.length ? ` Removed: ${removed.join(", ")}.` : "",
			failed.length ? ` Could not fetch: ${failed.join(", ")}.` : "",
		].join("");
	} catch {
		return "";
	}
}

export default command({
	description:
		"Reconcile installed plugins with the skill directories agents read and the MCP entries Claude, Codex, and pdev read, adding, refreshing, and reaping both",
	skipMiddleware: true,
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["directory", "plugin", "path"],
			["SKILL", "PLUGIN", "PATH"],
			[30, 16, 54],
		),
	run: async () => {
		const organization = await organizationChanges();
		const result = await syncPlugins();
		const reaped = result.removed
			? ` Reaped ${result.removed} stale skill folder${result.removed === 1 ? "" : "s"}.`
			: "";
		const mcp = result.mcpError
			? ` Agent MCP config was NOT written: ${result.mcpError}`
			: ` ${result.mcpServers} MCP ${result.mcpServers === 1 ? "entry" : "entries"} in place for Claude, Codex, and pdev.`;

		return {
			data: result.entries.map((entry) => ({
				directory: entry.directory,
				plugin: entry.plugin,
				path: entry.path,
			})),
			message: `Synced ${result.skills} skill${result.skills === 1 ? "" : "s"} from ${result.plugins} plugin${result.plugins === 1 ? "" : "s"} into ${skillsRoot()}.${reaped}${mcp}${organization}`,
		};
	},
});
