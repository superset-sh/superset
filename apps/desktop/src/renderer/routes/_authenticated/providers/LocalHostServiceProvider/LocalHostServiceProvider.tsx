import { toast } from "@superset/ui/sonner";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	setClientMachineId,
	setHostServiceSecret,
} from "renderer/lib/host-service-auth";
import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";
import { MOCK_ORG_ID } from "shared/constants";

interface LocalHostServiceContextValue {
	machineId: string;
	activeHostUrl: string | null;
	activeOrganizationId: string | null;
	activeOrganizationName: string | null;
	hostServiceStatus: HostServiceAvailabilityStatus;
	/**
	 * Resolve once the local host service is live, returning its loopback URL
	 * (or null on timeout). Use this at the point of a host-backed action so
	 * local-first UI can act immediately without gating on `activeHostUrl`.
	 */
	waitForHostReady: (timeoutMs?: number) => Promise<string | null>;
}

const LocalHostServiceContext =
	createContext<LocalHostServiceContextValue | null>(null);

export function LocalHostServiceProvider({
	children,
}: {
	children: ReactNode;
}) {
	const utils = electronTrpc.useUtils();
	const { data: session } = authClient.useSession();
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const { mutate: startHostService } =
		electronTrpc.hostServiceCoordinator.start.useMutation({
			onError: (error) => {
				// Surface the failure — React Query otherwise settles it silently.
				console.error("[host-service] start failed:", error);
				// Auth preconditions resolve once the token lands; not a real failure.
				if (error.data?.code === "UNAUTHORIZED") return;
				// A stable id collapses repeated retry failures into one toast
				// instead of stacking a new one every retry interval.
				toast.error("Host service failed to start", {
					id: "host-service-start-failed",
					description: error.message,
				});
			},
		});

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: machineIdData } = electronTrpc.device.getMachineId.useQuery(
		undefined,
		{ staleTime: Number.POSITIVE_INFINITY },
	);

	useEffect(() => {
		if (machineIdData?.machineId) {
			setClientMachineId(machineIdData.machineId);
		}
	}, [machineIdData]);

	const { data: activeConnection } =
		electronTrpc.hostServiceCoordinator.getConnection.useQuery(
			{ organizationId: activeOrganizationId as string },
			{ enabled: !!activeOrganizationId, refetchInterval: 5_000 },
		);

	const { data: processStatus } =
		electronTrpc.hostServiceCoordinator.getProcessStatus.useQuery(
			{ organizationId: activeOrganizationId as string },
			{
				enabled: !!activeOrganizationId,
				refetchInterval: activeConnection?.port ? false : 1_000,
			},
		);

	// Proactively start the local host when the active org resolves so it's ready
	// before the user acts. Main already starts previously-hosted orgs at boot and
	// on token-saved; this covers a brand-new active org (no host dir yet) from the
	// session. A failed start here (e.g. token not yet persisted) is recovered by
	// waitForHostReady, which re-attempts on demand.
	useEffect(() => {
		if (activeOrganizationId) {
			startHostService({ organizationId: activeOrganizationId });
		}
	}, [activeOrganizationId, startHostService]);

	const waitForHostReady = useCallback(
		async (timeoutMs = 20_000): Promise<string | null> => {
			const orgId = activeOrganizationId;
			if (!orgId) return null;
			// Resolve the live host URL if a port is up, else null. Swallows
			// transient IPC/tRPC fetch failures so a poll error never rejects the
			// nullable contract callers rely on.
			const tryGetHostUrl = async (): Promise<string | null> => {
				try {
					const connection =
						await utils.hostServiceCoordinator.getConnection.fetch({
							organizationId: orgId,
						});
					if (connection?.port) {
						const hostUrl = `http://127.0.0.1:${connection.port}`;
						if (connection.secret)
							setHostServiceSecret(hostUrl, connection.secret);
						return hostUrl;
					}
				} catch (error) {
					console.warn("[host-service] connection poll failed:", error);
				}
				return null;
			};
			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline) {
				const hostUrl = await tryGetHostUrl();
				if (hostUrl) return hostUrl;
				// Re-attempt the idempotent, local-only start each iteration so a
				// transient failure (auth token not yet persisted, spawn miss)
				// self-heals instead of polling a host that never came up.
				startHostService({ organizationId: orgId });
				await new Promise((resolve) => setTimeout(resolve, 1_000));
			}
			// Final check: the last start may have brought the host up during the
			// trailing sleep, after the deadline elapsed.
			return await tryGetHostUrl();
		},
		[activeOrganizationId, startHostService, utils],
	);

	const activeOrganizationName = activeOrganization?.name ?? null;

	const value = useMemo<LocalHostServiceContextValue | null>(() => {
		if (!machineIdData) return null;
		const machineId = machineIdData.machineId;
		const hostServiceStatus: HostServiceAvailabilityStatus =
			activeConnection?.port != null
				? "running"
				: (processStatus?.status ?? "unknown");

		if (!activeConnection?.port) {
			return {
				machineId,
				activeHostUrl: null,
				activeOrganizationId: activeOrganizationId ?? null,
				activeOrganizationName,
				hostServiceStatus,
				waitForHostReady,
			};
		}

		const activeHostUrl = `http://127.0.0.1:${activeConnection.port}`;
		if (activeConnection.secret) {
			setHostServiceSecret(activeHostUrl, activeConnection.secret);
		}

		return {
			machineId,
			activeHostUrl,
			activeOrganizationId: activeOrganizationId ?? null,
			activeOrganizationName,
			hostServiceStatus,
			waitForHostReady,
		};
	}, [
		machineIdData,
		activeConnection,
		activeOrganizationId,
		activeOrganizationName,
		processStatus?.status,
		waitForHostReady,
	]);

	if (!value) return null;

	return (
		<LocalHostServiceContext.Provider value={value}>
			{children}
		</LocalHostServiceContext.Provider>
	);
}

export function useLocalHostService(): LocalHostServiceContextValue {
	const context = useContext(LocalHostServiceContext);
	if (!context) {
		throw new Error(
			"useLocalHostService must be used within LocalHostServiceProvider",
		);
	}
	return context;
}
