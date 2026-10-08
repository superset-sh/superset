import { useLingui } from "@lingui/react/macro";
import type { PagePresenceViewer } from "@superset/shared/page-presence";
import { useCallback } from "react";

export function usePresenceName(): (viewer: PagePresenceViewer) => string {
	const { t } = useLingui();
	return useCallback(
		(viewer: PagePresenceViewer) => {
			const number = viewer.guestNumber;
			if (!viewer.guest && viewer.name) return viewer.name;
			return number
				? t({ message: `Guest ${number}` })
				: t({ message: "Guest" });
		},
		[t],
	);
}
