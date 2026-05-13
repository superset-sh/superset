import { useEffect, useRef } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useSetPreferredOpenInAppIntent } from "renderer/stores/set-preferred-open-in-app-intent";

export function SetPreferredOpenInAppMount() {
	const target = useSetPreferredOpenInAppIntent((s) => s.target);
	const clear = useSetPreferredOpenInAppIntent((s) => s.clear);
	const collections = useCollections();
	const { ensureProjectInSidebar } = useDashboardSidebarState();
	const lastTickRef = useRef(0);

	useEffect(() => {
		if (!target || target.tick === lastTickRef.current) return;
		lastTickRef.current = target.tick;
		ensureProjectInSidebar(target.projectId);
		collections.v2SidebarProjects.update(target.projectId, (draft) => {
			draft.defaultOpenInApp = target.app;
		});
		clear();
	}, [target, ensureProjectInSidebar, collections, clear]);

	return null;
}
