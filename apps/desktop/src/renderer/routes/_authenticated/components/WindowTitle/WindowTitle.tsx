import { useMatchRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { productName } from "~/package.json";

/**
 * Names this window so it can be told apart in macOS Mission Control and the
 * Window menu. Electron mirrors `document.title` to the native BrowserWindow
 * title, and each window is its own renderer with its own active org.
 *
 * The org alone is not enough: several windows on the SAME org are a normal way
 * to work (one per project, one per monitor), and they all showed one identical
 * entry in the Window menu. So the workspace the window is on leads, with the
 * org behind it — the window is identified by what it is doing, then by where.
 */
export function WindowTitle() {
	const activeOrganizationId = useActiveOrganizationId();
	// The list is every org you belong to, so it is shared and cached across
	// windows; only the id picked out of it is per-window.
	const { data: organizations } =
		cloudTrpc.organization.list.useQuery(undefined);
	const organizationName = organizations?.find(
		(organization) => organization.id === activeOrganizationId,
	)?.name;

	const matchRoute = useMatchRoute();
	// Fuzzy: the window is "on" a workspace for anything nested under it, not
	// only the index route. Today that route has no children beyond the index,
	// so this changes nothing yet — but an exact match would silently drop the
	// workspace from the title the moment one is added.
	const match = matchRoute({ to: "/v2-workspace/$workspaceId", fuzzy: true });
	const workspaceId = match ? match.workspaceId : null;
	// Already fanned out for the sidebar — this reads the same rows rather than
	// issuing a lookup of its own.
	const { workspaces } = useHostWorkspaces();
	const workspaceName = workspaceId
		? workspaces.find((workspace) => workspace.id === workspaceId)?.name
		: undefined;

	useEffect(() => {
		// No " — Superset" suffix: the Window menu lists these under the Superset
		// menu bar already, so repeating it on every entry is noise.
		document.title = workspaceName
			? organizationName
				? `${workspaceName} — ${organizationName}`
				: workspaceName
			: (organizationName ?? productName);
	}, [workspaceName, organizationName]);

	return null;
}
