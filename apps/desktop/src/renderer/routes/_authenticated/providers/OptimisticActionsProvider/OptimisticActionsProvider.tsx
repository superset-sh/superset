import { createContext, type ReactNode, useContext } from "react";
import { useStableActions } from "renderer/hooks/useStableActions";
import { useOptimisticActionsSource } from "renderer/routes/_authenticated/hooks/useOptimisticActions/useOptimisticActionsSource";

type OptimisticActions = ReturnType<typeof useOptimisticActionsSource>;

export const OptimisticActionsContext = createContext<OptimisticActions | null>(
	null,
);

/**
 * Runs the optimistic-action source once and shares it as an object whose
 * identity never changes. The source closes over the host workspace list,
 * sandbox targets and query clients, so handing it out directly re-rendered
 * every consumer, one sidebar row each, on any workspace change.
 */
export function OptimisticActionsProvider({
	children,
}: {
	children: ReactNode;
}) {
	const actions = useStableActions(useOptimisticActionsSource());
	return (
		<OptimisticActionsContext.Provider value={actions}>
			{children}
		</OptimisticActionsContext.Provider>
	);
}

export function useOptimisticActions(): OptimisticActions {
	const value = useContext(OptimisticActionsContext);
	if (!value) {
		throw new Error(
			"useOptimisticActions must be used within OptimisticActionsProvider",
		);
	}
	return value;
}
