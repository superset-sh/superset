import { boolean, CLIError, string, table } from "@superset/cli-framework";
import type {
	SidebarFolder,
	SidebarFolderPruneResult,
	SidebarFolderSkipReason,
} from "@superset/shared/sidebar-folders";
import { command } from "../../../../lib/command";
import { resolveHostClient } from "../../../../lib/resolve-host-client";

const SKIP_NOTES: Record<SidebarFolderSkipReason, string> = {
	unanswered: "a host or the cloud has not answered yet",
	settingHostsUnknown: "not every host that keeps its settings is known yet",
	organizationChanged: "the desktop window switched organization",
	noLongerEmpty: "it changed while the prune ran",
};

function rowsOf(result: SidebarFolderPruneResult) {
	const row = (status: string, folder: SidebarFolder, note?: string) => ({
		status,
		name: folder.name,
		project: folder.projectName ?? folder.projectId ?? "sessions",
		tag: folder.tag,
		note: note ?? "",
	});
	return [
		...result.removed.map((folder) =>
			row(result.dryRun ? "would remove" : "removed", folder),
		),
		...result.skipped.map((folder) =>
			row("skipped", folder, SKIP_NOTES[folder.reason]),
		),
		...result.failed.map((folder) => row("failed", folder, folder.error)),
	];
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function summarize(result: SidebarFolderPruneResult): string {
	const parts = [
		result.dryRun
			? `Would remove ${plural(result.removed.length, "empty folder")}`
			: `Removed ${plural(result.removed.length, "empty folder")}`,
	];
	if (result.skipped.length > 0) parts.push(`skipped ${result.skipped.length}`);
	if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
	return `${parts.join("; ")}.`;
}

export default command({
	description:
		"Remove sidebar folders that no workspace is tagged into, in the desktop app on this machine. Only the folder's name, color and order go; no workspace is changed",
	options: {
		project: string().desc("Only folders in this project (id)"),
		dryRun: boolean().desc("List the folders without removing them"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, {});
		let result: SidebarFolderPruneResult;
		try {
			result = await client.sidebar.pruneEmptyFolders.mutate({
				projectId: options.project ?? undefined,
				dryRun: options.dryRun ?? false,
			});
		} catch (error) {
			if (
				error instanceof Error &&
				/No procedure found on path "?sidebar\./.test(error.message)
			) {
				throw new CLIError(
					"The host service on this machine is too old to remove empty folders",
					"Update the Superset desktop app",
				);
			}
			throw error;
		}
		const rows = rowsOf(result);
		return {
			data: result,
			message: [
				summarize(result),
				...(rows.length > 0
					? [
							table(
								rows,
								["status", "name", "project", "tag", "note"],
								["STATUS", "NAME", "PROJECT", "TAG", "NOTE"],
								[14, 30, 24, 30, 60],
							),
						]
					: []),
			].join("\n"),
		};
	},
});
