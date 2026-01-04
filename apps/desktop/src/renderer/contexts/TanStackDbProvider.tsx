import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	createDeviceCollections,
	createOrgCollections,
	type DeviceCollections,
	type OrgCollections,
} from "renderer/collections";
import { trpc } from "renderer/lib/trpc";
import { useAuth } from "./AuthProvider";
import { useOrganization } from "./OrganizationProvider";

interface CollectionsContextValue {
	// Org collections (Electric-synced, per-org)
	tasks: OrgCollections["tasks"] | null;
	repositories: OrgCollections["repositories"] | null;
	members: OrgCollections["members"] | null;
	users: OrgCollections["users"] | null;

	// Device collections (localStorage, device-only)
	deviceSettings: DeviceCollections["deviceSettings"];

	// Status
	isInitializing: boolean;
	error: Error | null;
}

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: 1000 * 60 * 60, // 1 hour
			staleTime: 1000 * 60 * 5, // 5 minutes
		},
	},
});

export function CollectionsProvider({ children }: { children: ReactNode }) {
	// Get access token and organization from providers
	const { accessToken } = useAuth();
	const { activeOrganizationId } = useOrganization();

	// Ensure user is loaded
	const { data: user } = trpc.user.me.useQuery();

	const [error, setError] = useState<Error | null>(null);

	// Get API URL from environment
	const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

	// Device collections (created once, never change)
	const deviceCollections = useMemo(() => createDeviceCollections(), []);

	// Stable map of collections per org (never recreate collections, just cache them)
	const collectionsCache = useRef<Map<string, OrgCollections>>(new Map());

	// Get or create collections for the active org
	const orgCollections = useMemo(() => {
		if (!user?.id || !activeOrganizationId) return null;

		const cached = collectionsCache.current.get(activeOrganizationId);
		if (cached) {
			console.log(
				"[CollectionsProvider] Reusing cached collections for org:",
				activeOrganizationId,
			);
			return cached;
		}

		try {
			const headers = { Authorization: `Bearer ${accessToken}` };
			const electricUrl = `${apiUrl}/electric/v1/shape?organizationId=${activeOrganizationId}`;

			const newOrgCollections = createOrgCollections({
				orgId: activeOrganizationId,
				electricUrl,
				apiUrl,
				headers,
			});

			// Cache the collections
			collectionsCache.current.set(activeOrganizationId, newOrgCollections);

			setError(null);
			return newOrgCollections;
		} catch (err) {
			console.error(
				"[CollectionsProvider] Failed to create org collections:",
				err,
			);
			setError(err as Error);
			return null;
		}
	}, [activeOrganizationId, user?.id, accessToken, apiUrl]);

	const isInitializing = !user?.id || !orgCollections;

	const value: CollectionsContextValue = {
		// Org collections (null if not initialized)
		tasks: orgCollections?.tasks ?? null,
		repositories: orgCollections?.repositories ?? null,
		members: orgCollections?.members ?? null,
		users: orgCollections?.users ?? null,
		// Device collections (always available)
		deviceSettings,
		isInitializing,
		error,
	};

	if (isInitializing) {
		return null; // Or loading spinner
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-screen">
				<div className="p-4 max-w-md">
					<h2 className="text-lg font-semibold text-destructive mb-2">
						Failed to initialize database
					</h2>
					<p className="text-sm text-muted-foreground mb-4">{error.message}</p>
					<pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">
						{error.stack}
					</pre>
				</div>
			</div>
		);
	}

	return (
		<QueryClientProvider client={queryClient}>
			<CollectionsContext.Provider value={value}>
				{children}
			</CollectionsContext.Provider>
		</QueryClientProvider>
	);
}

// ============================================
// HOOKS
// ============================================

export const useCollections = () => {
	const context = useContext(CollectionsContext);
	if (!context) {
		throw new Error("useCollections must be used within CollectionsProvider");
	}
	return context;
};
