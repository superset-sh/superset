import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import { trpc } from "../../lib/trpc";
import { createCollections } from "./collections";

type Collections = ReturnType<typeof createCollections>;

const CollectionsContext = createContext<Collections | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
	const { data: session } = trpc.auth.onSessionChange.useSubscription();
	const { data: tokenData } = trpc.auth.onAccessToken.useSubscription();
	const [error, setError] = useState<Error | null>(null);

	const activeOrgId = session?.session.activeOrganizationId;
	const token = tokenData?.accessToken;

	const collections = useMemo(() => {
		console.log("[CollectionsProvider] Creating collections with:", {
			hasToken: !!token,
			activeOrgId,
		});

		if (!token || !activeOrgId) {
			console.log(
				"[CollectionsProvider] Missing token or activeOrgId, returning null",
			);
			return null;
		}

		try {
			return createCollections({ token, activeOrgId });
		} catch (err) {
			console.error("[CollectionsProvider] Failed to create collections:", err);
			setError(err instanceof Error ? err : new Error(String(err)));
			return null;
		}
	}, [token, activeOrgId]);

	if (error) {
		return (
			<div className="flex items-center justify-center h-screen">
				<div className="flex flex-col items-center gap-2 text-destructive">
					<span className="text-sm">Failed to initialize collections</span>
					<span className="text-xs text-muted-foreground">{error.message}</span>
				</div>
			</div>
		);
	}

	if (!collections) {
		return (
			<div className="flex items-center justify-center h-screen">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	return (
		<CollectionsContext.Provider value={collections}>
			{children}
		</CollectionsContext.Provider>
	);
}

export function useCollections(): Collections {
	const context = useContext(CollectionsContext);
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
}
