import { CatchBoundary, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ContentError } from "../ContentError";

export function ContentBoundary({ children }: { children: ReactNode }) {
	const loadedAt = useRouterState({ select: (state) => state.loadedAt });
	return (
		<CatchBoundary getResetKey={() => loadedAt} errorComponent={ContentError}>
			{children}
		</CatchBoundary>
	);
}
