import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useWorkspaceCreatesStore } from "./store";

export function WorkspaceCreatesManager() {
	const collections = useCollections();
	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q.from({ ws: collections.v2Workspaces }).select(({ ws }) => ({
				id: ws.id,
			})),
		[collections],
	);
	const entries = useWorkspaceCreatesStore((store) => store.entries);

	useEffect(() => {
		if (workspaces.length === 0 || entries.length === 0) return;
		const realIds = new Set(workspaces.map((w) => w.id));
		const remove = useWorkspaceCreatesStore.getState().remove;
		for (const entry of entries) {
			const id = entry.snapshot.id;
			if (id && realIds.has(id)) {
				remove(id);
			}
		}
	}, [workspaces, entries]);

	return null;
}
