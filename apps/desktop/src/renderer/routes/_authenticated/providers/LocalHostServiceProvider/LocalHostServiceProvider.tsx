import { useLiveQuery } from "@tanstack/react-db";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";
import { MOCK_ORG_ID } from "shared/constants";
import { useCollections } from "../CollectionsProvider";

interface LocalHostServiceContextValue {
	machineId: string;
	activeHostUrl: string | null;
}

const LocalHostServiceContext =
	createContext<LocalHostServiceContextValue | null>(null);

// Exponential backoff between automatic re-tries of `start` for the active
// org. Index N is the delay before attempt N+1. After RETRY_DELAYS_MS.length
// failures we stop retrying; the right pane stays blank until something else
// (org switch, tray restart, app relaunch) re-triggers a start.
const RETRY_DELAYS_MS = [1_000, 4_000, 15_000];

export function LocalHostServiceProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { mutate: startHostService } =
		electronTrpc.hostServiceCoordinator.start.useMutation();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const organizationIds = useMemo(
		() => organizations?.map((organization) => organization.id) ?? [],
		[organizations],
	);

	// Retry bookkeeping. Refs hold the live values so the status subscription
	// and the start-mutation callbacks can read them without re-subscribing.
	const attemptRef = useRef(0);
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const activeOrgRef = useRef<string | null>(activeOrganizationId);

	const clearRetryTimer = useCallback(() => {
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
	}, []);

	// Ref-based indirection: scheduleRetry only needs to *call* fireStart
	// deferred via setTimeout. Going through a ref avoids the circular
	// useCallback dependency between the two.
	const fireStartRef = useRef<((orgId: string) => void) | null>(null);

	const scheduleRetry = useCallback(
		(organizationId: string) => {
			if (organizationId !== activeOrgRef.current) return;
			if (attemptRef.current >= RETRY_DELAYS_MS.length) return;
			const delay = RETRY_DELAYS_MS[attemptRef.current];
			attemptRef.current += 1;
			clearRetryTimer();
			retryTimerRef.current = setTimeout(() => {
				retryTimerRef.current = null;
				if (organizationId !== activeOrgRef.current) return;
				fireStartRef.current?.(organizationId);
			}, delay);
		},
		[clearRetryTimer],
	);

	const fireStart = useCallback(
		(organizationId: string) => {
			startHostService(
				{ organizationId },
				{
					onError: () => {
						if (organizationId !== activeOrgRef.current) return;
						scheduleRetry(organizationId);
					},
				},
			);
		},
		[startHostService, scheduleRetry],
	);

	useEffect(() => {
		fireStartRef.current = fireStart;
	}, [fireStart]);

	// Reset retry state whenever the active org changes — we don't carry
	// backoff across orgs.
	useEffect(() => {
		activeOrgRef.current = activeOrganizationId;
		attemptRef.current = 0;
		clearRetryTimer();
	}, [activeOrganizationId, clearRetryTimer]);

	// Initial start: fire once per org on mount/org-list change. Active org
	// gets the retry treatment via fireStart; inactive orgs use the bare
	// mutation (they get healed when the user switches to them).
	useEffect(() => {
		for (const organizationId of organizationIds) {
			if (organizationId === activeOrganizationId) {
				fireStart(organizationId);
			} else {
				startHostService({ organizationId });
			}
		}
	}, [organizationIds, activeOrganizationId, fireStart, startHostService]);

	electronTrpc.hostServiceCoordinator.onStatusChange.useSubscription(
		undefined,
		{
			onData: (event: {
				organizationId: string;
				status: "starting" | "running" | "stopped";
			}) => {
				if (event.organizationId !== activeOrgRef.current) return;
				if (event.status === "running") {
					attemptRef.current = 0;
					clearRetryTimer();
					return;
				}
				if (event.status === "stopped") {
					// Child died (or was killed) after running. Re-enter the backoff
					// chain unless we've already exhausted it for this active org.
					scheduleRetry(event.organizationId);
				}
			},
		},
	);

	useEffect(() => clearRetryTimer, [clearRetryTimer]);

	const { data: machineIdData } = electronTrpc.device.getMachineId.useQuery(
		undefined,
		{ staleTime: Number.POSITIVE_INFINITY },
	);

	const { data: activeConnection } =
		electronTrpc.hostServiceCoordinator.getConnection.useQuery(
			{ organizationId: activeOrganizationId as string },
			{ enabled: !!activeOrganizationId, refetchInterval: 5_000 },
		);

	const value = useMemo<LocalHostServiceContextValue | null>(() => {
		if (!machineIdData) return null;
		const machineId = machineIdData.machineId;

		if (!activeConnection?.port) {
			return { machineId, activeHostUrl: null };
		}

		const activeHostUrl = `http://127.0.0.1:${activeConnection.port}`;
		if (activeConnection.secret) {
			setHostServiceSecret(activeHostUrl, activeConnection.secret);
		}

		return { machineId, activeHostUrl };
	}, [machineIdData, activeConnection]);

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
