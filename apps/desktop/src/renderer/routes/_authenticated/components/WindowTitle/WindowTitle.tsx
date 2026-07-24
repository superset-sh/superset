import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { productName } from "~/package.json";

/**
 * Sets this window's document title to the active organization's name so each
 * platform window is distinguishable at a glance (e.g. in macOS Mission Control
 * and the window switcher). Electron mirrors `document.title` to the native
 * BrowserWindow title, and each window is its own renderer with its own active
 * org (per-window org context), so the titles differ per window.
 */
export function WindowTitle() {
	const collections = useCollections();
	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);
	const activeOrganization = organizations?.find(
		(o) => o.id === collections.activeOrganizationId,
	);

	useEffect(() => {
		document.title = activeOrganization?.name
			? `${activeOrganization.name} — ${productName}`
			: productName;
	}, [activeOrganization?.name]);

	return null;
}
