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
	getWorkspaceServiceClient,
	type WorkspaceServiceClient,
} from "renderer/lib/workspace-service-client";
import { MOCK_ORG_ID } from "shared/constants";
import { useCollections } from "../CollectionsProvider";

export interface OrgService {
	port: number;
	url: string;
	client: WorkspaceServiceClient;
}

interface WorkspaceServiceContextValue {
	/** Map of organizationId → { port, url, client } for all running services */
	services: Map<string, OrgService>;
}

const WorkspaceServiceContext =
	createContext<WorkspaceServiceContextValue | null>(null);

export function WorkspaceServiceProvider({
	children,
}: {
	children: ReactNode;
}) {
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

	// Start a workspace service for every org
	useEffect(() => {
		for (const orgId of orgIds) {
			utils.workspaceServiceManager.getLocalPort
				.ensureData({ organizationId: orgId })
				.catch((err) => {
					console.error(
						`[workspace-service] Failed to start for org ${orgId}:`,
						err,
					);
				});
		}
	}, [orgIds, utils]);

	// Query the active org's port reactively
	const { data: activePortData } =
		electronTrpc.workspaceServiceManager.getLocalPort.useQuery(
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
				client: getWorkspaceServiceClient(port),
			});
		};

		for (const orgId of orgIds) {
			const cached = utils.workspaceServiceManager.getLocalPort.getData({
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
		<WorkspaceServiceContext.Provider value={value}>
			{children}
		</WorkspaceServiceContext.Provider>
	);
}

export function useWorkspaceService(): WorkspaceServiceContextValue {
	const context = useContext(WorkspaceServiceContext);
	if (!context) {
		throw new Error(
			"useWorkspaceService must be used within WorkspaceServiceProvider",
		);
	}
	return context;
}
