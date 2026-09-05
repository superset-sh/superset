import { useEffect, useRef } from "react";
import { useArchiveWorkspaceFlow } from "renderer/lib/workspaces/useArchiveWorkspaceFlow";
import { useArchiveWorkspaceIntent } from "renderer/stores/archive-workspace-intent";

/**
 * Headless consumer of archive requests (see archive-workspace-intent): the
 * one place the archive flow is instantiated. Archiving is reversible and
 * instant, so there is no dialog — each queued request runs as soon as it
 * reaches the head of the queue. Lives next to DeleteWorkspaceMount at the
 * dashboard level so it outlives every row and menu that can request it.
 */
export function ArchiveWorkspaceMount() {
	const head = useArchiveWorkspaceIntent((s) => s.queue[0] ?? null);
	const shift = useArchiveWorkspaceIntent((s) => s.shift);
	const { archiveWorkspaces } = useArchiveWorkspaceFlow();
	// The flow callback's identity follows the workspace list; a list update
	// mid-flight must not re-run a request the effect already started.
	const startedRef = useRef<number | null>(null);

	useEffect(() => {
		if (!head || startedRef.current === head.requestId) return;
		startedRef.current = head.requestId;
		shift(head.requestId);
		void archiveWorkspaces({
			workspaceIds: head.workspaceIds,
			source: head.source,
		});
	}, [head, shift, archiveWorkspaces]);

	return null;
}
