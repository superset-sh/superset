import { useLiveQuery } from "@tanstack/react-db";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getHostServiceClient,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import { MOCK_ORG_ID } from "shared/constants";
import { useCollections } from "../CollectionsProvider";

export interface OrgService {
	port: number;
	url: string;
	client: HostServiceClient;
}

interface HostServiceContextValue {
	/** Map of organizationId → { port, url, client } for all running services */
	services: Map<string, OrgService>;
}

const HostServiceContext = createContext<HostServiceContextValue | null>(null);

export function HostServiceProvider({ children }: { children: ReactNode }) {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const utils = electronTrpc.useUtils();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const orgIds = useMemo(
		() => organizations?.map((o) => o.id) ?? [],
		[organizations],
	);

	// Start a host service for every org
	useEffect(() => {
		for (const orgId of orgIds) {
			utils.hostServiceManager.getLocalPort
				.ensureData({ organizationId: orgId })
				.catch((err) => {
					console.error(
						`[host-service] Failed to start for org ${orgId}:`,
						err,
					);
				});
		}
	}, [orgIds, utils]);

	// Query the active org's port reactively
	const { data: activePortData } =
		electronTrpc.hostServiceManager.getLocalPort.useQuery(
			{ organizationId: activeOrganizationId as string },
			{ enabled: !!activeOrganizationId },
		);

	// Build the services map from cached query data
	const services = useMemo(() => {
		const map = new Map<string, OrgService>();

		const addOrg = (orgId: string, port: number) => {
			map.set(orgId, {
				port,
				url: `http://127.0.0.1:${port}`,
				client: getHostServiceClient(port),
			});
		};

		for (const orgId of orgIds) {
			const cached = utils.hostServiceManager.getLocalPort.getData({
				organizationId: orgId,
			});
			if (cached?.port) {
				addOrg(orgId, cached.port);
			}
		}

		// Ensure active org is included even if orgIds hasn't updated yet
		if (
			activeOrganizationId &&
			activePortData?.port &&
			!map.has(activeOrganizationId)
		) {
			addOrg(activeOrganizationId, activePortData.port);
		}

		return map;
	}, [orgIds, utils, activeOrganizationId, activePortData]);

	const value = useMemo(() => ({ services }), [services]);

	return (
		<HostServiceContext.Provider value={value}>
			{children}
		</HostServiceContext.Provider>
	);
}

export function useHostService(): HostServiceContextValue {
	const context = useContext(HostServiceContext);
	if (!context) {
		throw new Error("useHostService must be used within HostServiceProvider");
	}
	return context;
}
