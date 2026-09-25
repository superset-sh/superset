import { useEffect } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { productName } from "~/package.json";

/**
 * Sets this window's document title to the active organization's name so each
 * platform window is distinguishable at a glance (e.g. in macOS Mission Control
 * and the window switcher). Electron mirrors `document.title` to the native
 * BrowserWindow title, and each window is its own renderer with its own active
 * org (per-window org context), so the titles differ per window.
 */
export function WindowTitle() {
	const activeOrganizationId = useActiveOrganizationId();
	// The list is every org you belong to, so it is shared and cached across
	// windows; only the id picked out of it is per-window.
	const { data: organizations } =
		cloudTrpc.organization.list.useQuery(undefined);
	const activeOrganization = organizations?.find(
		(organization) => organization.id === activeOrganizationId,
	);

	useEffect(() => {
		// Org name alone: the macOS Window menu lists these titles under the
		// Superset menu bar, so a "— Superset" suffix on every entry is noise.
		document.title = activeOrganization?.name ?? productName;
	}, [activeOrganization?.name]);

	return null;
}
