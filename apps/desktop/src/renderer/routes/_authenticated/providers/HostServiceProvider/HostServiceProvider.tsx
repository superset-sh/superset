import type { SshHostConfig } from "@superset/local-db";
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
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import { MOCK_ORG_ID } from "shared/constants";
import type { SshHostConnectionStatus } from "shared/ssh-hosts";
import { useCollections } from "../CollectionsProvider";

export interface OrgService {
	kind: "local" | "ssh";
	port: number;
	url: string;
	client: HostServiceClient;
}

export interface SshHostService extends OrgService {
	kind: "ssh";
	host: SshHostConfig;
	hostId: string;
	status: SshHostConnectionStatus;
}

interface HostServiceContextValue {
	services: Map<string, OrgService>;
	sshHosts: SshHostConfig[];
	sshServices: Map<string, SshHostService>;
	sshStatuses: Map<string, SshHostConnectionStatus>;
}

const HostServiceContext = createContext<HostServiceContextValue | null>(null);

export function getSshHostServiceKey(hostId: string): string {
	return hostId;
}

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
	const { data: sshHosts = [] } =
		electronTrpc.hostServiceManager.sshHosts.list.useQuery();

	const orgIds = useMemo(
		() => organizations?.map((organization) => organization.id) ?? [],
		[organizations],
	);

	useEffect(() => {
		for (const organizationId of orgIds) {
			utils.hostServiceManager.getLocalPort
				.ensureData({ organizationId })
				.catch((error) => {
					console.error(
						`[host-service] Failed to start local host-service for org ${organizationId}:`,
						error,
					);
				});
		}
	}, [orgIds, utils.hostServiceManager.getLocalPort]);

	const { data: activePortData } =
		electronTrpc.hostServiceManager.getLocalPort.useQuery(
			{ organizationId: activeOrganizationId as string },
			{ enabled: Boolean(activeOrganizationId) },
		);

	const sshConnectionQueries = electronTrpc.useQueries((t) =>
		activeOrganizationId
			? sshHosts.map((host) =>
					t.sshTunnels.connect({
						hostId: host.id,
					}),
				)
			: [],
	);

	const services = useMemo(() => {
		const map = new Map<string, OrgService>();

		const addLocalService = (organizationId: string, port: number) => {
			map.set(organizationId, {
				kind: "local",
				port,
				url: `http://127.0.0.1:${port}`,
				client: getHostServiceClient(port),
			});
		};

		for (const organizationId of orgIds) {
			const cached = utils.hostServiceManager.getLocalPort.getData({
				organizationId,
			});
			if (cached?.port) {
				addLocalService(organizationId, cached.port);
			}
		}

		if (
			activeOrganizationId &&
			activePortData?.port &&
			!map.has(activeOrganizationId)
		) {
			addLocalService(activeOrganizationId, activePortData.port);
		}

		return map;
	}, [
		activeOrganizationId,
		activePortData,
		orgIds,
		utils.hostServiceManager.getLocalPort,
	]);

	const sshStatuses = useMemo(() => {
		const map = new Map<string, SshHostConnectionStatus>();

		sshHosts.forEach((host, index) => {
			const status = sshConnectionQueries[index]?.data?.status;
			if (!status) {
				return;
			}
			map.set(getSshHostServiceKey(host.id), status);
		});

		return map;
	}, [sshConnectionQueries, sshHosts]);

	const sshServices = useMemo(() => {
		const map = new Map<string, SshHostService>();

		sshHosts.forEach((host) => {
			const key = getSshHostServiceKey(host.id);
			const status = sshStatuses.get(key);
			if (!status?.hostUrl || status.localPort === null) {
				return;
			}

			map.set(key, {
				kind: "ssh",
				host,
				hostId: host.id,
				status,
				port: status.localPort,
				url: status.hostUrl,
				client: getHostServiceClientByUrl(status.hostUrl),
			});
		});

		return map;
	}, [sshHosts, sshStatuses]);

	const value = useMemo(
		() => ({
			services,
			sshHosts,
			sshServices,
			sshStatuses,
		}),
		[services, sshHosts, sshServices, sshStatuses],
	);

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
