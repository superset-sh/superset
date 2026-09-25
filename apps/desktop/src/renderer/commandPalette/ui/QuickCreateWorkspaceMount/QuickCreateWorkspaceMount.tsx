import { useEffect, useRef } from "react";
import { useQuickCreateWorkspace } from "renderer/hooks/useQuickCreateWorkspace";
import { useQuickCreateWorkspaceIntent } from "renderer/stores/quick-create-workspace-intent";

/**
 * No visible UI. `useQuickCreateWorkspace` needs full hook access (host
 * service, host projects, workspace-creates), which `Command.run` doesn't
 * have — the command palette requests through the intent store instead, and
 * this globally-mounted component performs the create.
 */
export function QuickCreateWorkspaceMount() {
	const quickCreateWorkspace = useQuickCreateWorkspace();
	const target = useQuickCreateWorkspaceIntent((state) => state.target);
	const clear = useQuickCreateWorkspaceIntent((state) => state.clear);
	const lastTickRef = useRef(0);

	useEffect(() => {
		if (!target || target.tick === lastTickRef.current) return;
		lastTickRef.current = target.tick;
		quickCreateWorkspace(target.projectId);
		clear();
	}, [target, quickCreateWorkspace, clear]);

	return null;
}
