import { useMemo } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

/**
 * Workspace names for the pages workspace filter, and nothing else.
 *
 * `page.list` returns workspace ids: names live in each host's SQLite and in
 * `cloud_workspaces`, never anywhere the server could join them. Both sources
 * here are already shared — the host fan-out runs once in its provider, the
 * cloud list is one query — so this adds no fetching of its own.
 */
export function usePageWorkspaceNames(): Map<string, string> {
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();

	return useMemo(() => {
		const names = new Map<string, string>();
		for (const workspace of hostWorkspaces) {
			names.set(workspace.id, workspace.name);
		}
		// Second, so a sandbox rename that landed in `cloud_workspaces` wins over
		// a stale row a host is still serving.
		for (const workspace of cloudWorkspaces ?? []) {
			names.set(workspace.id, workspace.name);
		}
		return names;
	}, [hostWorkspaces, cloudWorkspaces]);
}
