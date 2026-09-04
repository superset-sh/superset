import type { HostTagFoldersResult } from "renderer/hooks/host-projects/useHostTagFolders";

/**
 * A presentation migration is safe only after that exact host successfully
 * listed its rows. Offline, pending, failed, and pre-router hosts are skipped;
 * another replica's row never stands in for this host's state.
 */
export function getLegacyPresentationPushTargets({
	hostIds,
	scope,
	tag,
	hostResults,
}: {
	hostIds: readonly string[];
	scope: string;
	tag: string;
	hostResults: readonly HostTagFoldersResult[];
}): Array<{ machineId: string; hostUrl: string }> {
	const servingHosts = new Set(hostIds);
	return hostResults.flatMap((result) => {
		if (
			!servingHosts.has(result.target.machineId) ||
			result.status !== "ready" ||
			result.target.hostUrl === null ||
			result.settings.some(
				(setting) => setting.scope === scope && setting.tag === tag,
			)
		) {
			return [];
		}
		return [
			{
				machineId: result.target.machineId,
				hostUrl: result.target.hostUrl,
			},
		];
	});
}
