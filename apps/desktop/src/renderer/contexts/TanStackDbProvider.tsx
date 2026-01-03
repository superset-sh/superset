import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	createDeviceCollections,
	createOrgCollections,
	createOrgSettingsCollection,
	createUserCollections,
	type DeviceCollections,
	type OrgCollections,
	type UserCollections,
} from "renderer/collections";
import { trpc } from "renderer/lib/trpc";
import { type Organization, useOrganizations } from "./OrganizationsProvider";

const ACTIVE_ORG_KEY = "superset_active_organization_id";

interface TanStackDbContextValue {
	// Current context
	userId: string | null;
	activeOrganization: Organization;

	// Collections
	orgCollections: OrgCollections | null;
	userCollections: UserCollections | null;
	deviceCollections: DeviceCollections;

	// Actions
	switchOrganization: (orgId: string) => void;

	// Status
	isInitializing: boolean;
	error: Error | null;
}

const TanStackDbContext = createContext<TanStackDbContextValue | null>(null);

// Query client for TanStack DB (required even though we're using Electric)
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: 1000 * 60 * 60, // 1 hour
			staleTime: 1000 * 60 * 5, // 5 minutes
		},
	},
});

export function TanStackDbProvider({
	children,
	accessToken,
}: {
	children: ReactNode;
	accessToken: string | null;
}) {
	const organizations = useOrganizations();
	const [userId, setUserId] = useState<string | null>(null);
	const [activeOrganizationId, setActiveOrganizationId] = useState<string>(
		() => {
			const stored = localStorage.getItem(ACTIVE_ORG_KEY);
			const valid = organizations.find((o) => o.id === stored);
			return valid?.id ?? organizations[0].id;
		},
	);

	const [orgCollections, setOrgCollections] = useState<OrgCollections | null>(
		null,
	);
	const [userCollections, setUserCollections] =
		useState<UserCollections | null>(null);
	const [isInitializing, setIsInitializing] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const activeOrganization = organizations.find(
		(o) => o.id === activeOrganizationId,
	);
	if (!activeOrganization) {
		throw new Error(`Active organization not found: ${activeOrganizationId}.`);
	}

	// Get API URL from environment
	const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
	// Electric URL is proxied through the API server with org filtering
	const electricUrl = `${apiUrl.replace("/api", "")}/api/electric/v1/shape?organizationId=${activeOrganizationId}`;

	// Device collections (created once, never change)
	const deviceCollections = useMemo(() => createDeviceCollections(), []);

	// Get user ID from auth
	const { data: user } = trpc.user.me.useQuery();

	// Update userId when user data loads
	useEffect(() => {
		if (user?.id) {
			setUserId(user.id);
		}
	}, [user?.id]);

	// Create user collections when userId or accessToken changes
	useEffect(() => {
		if (!userId || accessToken === null) return;

		try {
			const headers = accessToken
				? { Authorization: `Bearer ${accessToken}` }
				: undefined;

			const newUserCollections = createUserCollections({
				userId,
				electricUrl,
				apiUrl,
				headers,
			});

			setUserCollections(newUserCollections);
		} catch (err) {
			console.error("[TanStackDB] Failed to create user collections:", err);
			setError(err as Error);
		}
	}, [userId, accessToken, electricUrl]);

	// Create org collections when org, userId, or accessToken changes
	useEffect(() => {
		if (!userId || !activeOrganizationId || accessToken === null) return;

		console.log(
			"[TanStackDB] Creating collections for organization:",
			activeOrganizationId,
		);
		console.log("[TanStackDB] Access token present:", !!accessToken);
		console.log("[TanStackDB] Access token length:", accessToken?.length);

		try {
			const headers = accessToken
				? { Authorization: `Bearer ${accessToken}` }
				: undefined;
			console.log("[TanStackDB] Headers created:", {
				hasHeaders: !!headers,
				hasAuth: !!headers?.Authorization,
			});

			const newOrgCollections = createOrgCollections({
				orgId: activeOrganizationId,
				electricUrl,
				apiUrl,
				headers,
			});

			const orgSettings = createOrgSettingsCollection({
				orgId: activeOrganizationId,
				electricUrl,
				apiUrl,
				headers,
			});

			setOrgCollections({
				...newOrgCollections,
				orgSettings,
			});

			setError(null);
			setIsInitializing(false);
		} catch (err) {
			console.error("[TanStackDB] Failed to create org collections:", err);
			setError(err as Error);
			setIsInitializing(false);
		}
	}, [activeOrganizationId, userId, accessToken, electricUrl]);

	const switchOrganization = useCallback((newOrgId: string) => {
		console.log("[TanStackDB] Switching to organization:", newOrgId);
		localStorage.setItem(ACTIVE_ORG_KEY, newOrgId);
		setActiveOrganizationId(newOrgId);
		setIsInitializing(true);
	}, []);

	const value: TanStackDbContextValue = {
		userId,
		activeOrganization,
		orgCollections,
		userCollections,
		deviceCollections,
		switchOrganization,
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
			<TanStackDbContext.Provider value={value}>
				{children}
			</TanStackDbContext.Provider>
		</QueryClientProvider>
	);
}

// ============================================
// HOOKS
// ============================================

export const useTanStackDb = () => {
	const context = useContext(TanStackDbContext);
	if (!context) {
		throw new Error("useTanStackDb must be used within TanStackDbProvider");
	}
	return context;
};

// Convenience hook to maintain compatibility with old useActiveOrganization
export const useActiveOrganization = () => {
	const { activeOrganization, switchOrganization } = useTanStackDb();
	return { activeOrganization, switchOrganization };
};

export const useOrgCollections = () => {
	const { orgCollections } = useTanStackDb();
	if (!orgCollections) {
		throw new Error("No organization collections available");
	}
	return orgCollections;
};

export const useUserCollections = () => {
	const { userCollections } = useTanStackDb();
	if (!userCollections) {
		throw new Error("No user collections available");
	}
	return userCollections;
};

export const useDeviceCollections = () => {
	const { deviceCollections } = useTanStackDb();
	return deviceCollections;
};
