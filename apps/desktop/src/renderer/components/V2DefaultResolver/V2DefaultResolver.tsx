import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

export function V2DefaultResolver() {
	const optInV2 = useV2LocalOverrideStore((s) => s.optInV2);
	const setOptInV2 = useV2LocalOverrideStore((s) => s.setOptInV2);
	const utils = electronTrpc.useUtils();

	useEffect(() => {
		if (optInV2 !== null) return;
		let cancelled = false;
		void Promise.all([
			utils.workspaces.hasAny.fetch(),
			utils.projects.hasAny.fetch(),
		]).then(([hasWorkspace, hasProject]) => {
			if (cancelled) return;
			if (useV2LocalOverrideStore.getState().optInV2 !== null) return;
			setOptInV2(!hasWorkspace && !hasProject);
		});
		return () => {
			cancelled = true;
		};
	}, [optInV2, setOptInV2, utils]);

	return null;
}
