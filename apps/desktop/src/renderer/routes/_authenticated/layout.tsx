import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { DndProvider } from "react-dnd";
import { HiOutlineWifi } from "react-icons/hi2";
import { Paywall } from "renderer/components/Paywall";
import { useUpdateListener } from "renderer/components/UpdateToast";
import { env } from "renderer/env.renderer";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import {
	authClient,
	getAuthToken,
	setAuthToken,
	setJwt,
} from "renderer/lib/auth-client";
import {
	AUTHENTICATED_SESSION_RECOVERY_TIMEOUT_MS,
	hasAuthenticatedSessionRecoveryTimedOut,
	shouldRecoverAuthenticatedSession,
} from "renderer/lib/auth-session-state";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { showWorkspaceAutoNameWarningToast } from "renderer/lib/workspaces/showWorkspaceAutoNameWarningToast";
import { InitGitDialog } from "renderer/react-query/projects/InitGitDialog";
import { DaemonAutoUpdateFailureDialog } from "renderer/routes/_authenticated/components/DaemonAutoUpdateFailureDialog";
import { DashboardNewWorkspaceModal } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal";
import { WorkspaceInitEffects } from "renderer/screens/main/components/WorkspaceInitEffects";
import { useSettingsStore } from "renderer/stores/settings-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { setPaneWorkspaceRunState } from "renderer/stores/tabs/workspace-run";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { MOCK_ORG_ID, NOTIFICATION_EVENTS } from "shared/constants";
import { AgentHooks } from "./components/AgentHooks";
import { FileMenuListener } from "./components/FileMenuListener";
import { GlobalBrowserLifecycle } from "./components/GlobalBrowserLifecycle";
import { TeardownLogsDialog } from "./components/TeardownLogsDialog";
import { V2NotificationController } from "./components/V2NotificationController";
import { createPierreWorker } from "./lib/pierreWorker";
import { CollectionsProvider } from "./providers/CollectionsProvider";
import { DeletingWorkspacesProvider } from "./providers/DeletingWorkspacesProvider";
import { LocalHostServiceProvider } from "./providers/LocalHostServiceProvider";

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const {
		data: session,
		isPending,
		isRefetching,
		refetch,
	} = authClient.useSession();
	const hasLocalToken = !!getAuthToken();
	const isOnline = useOnlineStatus();
	const navigate = useNavigate();
	const location = useLocation();
	const setOriginRoute = useSettingsStore((s) => s.setOriginRoute);
	const utils = electronTrpc.useUtils();
	const shownWorkspaceInitWarningsRef = useRef(new Set<string>());
	const signOut = electronTrpc.auth.signOut.useMutation();
	const [sessionRecoveryStartedAtMs, setSessionRecoveryStartedAtMs] = useState<
		number | null
	>(null);
	const [sessionRecoveryAttempted, setSessionRecoveryAttempted] =
		useState(false);
	const [sessionRecoveryTimedOut, setSessionRecoveryTimedOut] = useState(false);

	const isSignedIn = env.SKIP_ENV_VALIDATION || !!session?.user;
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;
	const shouldRecoverSession = shouldRecoverAuthenticatedSession({
		hasLocalToken,
		isOnline,
		isSignedIn,
		skipEnvValidation: env.SKIP_ENV_VALIDATION,
	});
	const handleSignInAgain = useCallback(async () => {
		setAuthToken(null);
		setJwt(null);
		try {
			await signOut.mutateAsync();
		} catch (error) {
			console.warn("[auth] Failed to clear stale saved session", error);
		}
		await navigate({ to: "/sign-in", replace: true });
	}, [navigate, signOut.mutateAsync]);

	useAgentHookListener();
	useUpdateListener();

	useEffect(() => {
		if (!shouldRecoverSession) {
			setSessionRecoveryStartedAtMs(null);
			setSessionRecoveryAttempted(false);
			setSessionRecoveryTimedOut(false);
			return;
		}

		setSessionRecoveryStartedAtMs((startedAt) => startedAt ?? Date.now());
	}, [shouldRecoverSession]);

	useEffect(() => {
		if (
			!shouldRecoverSession ||
			sessionRecoveryStartedAtMs === null ||
			sessionRecoveryTimedOut
		) {
			return;
		}

		if (
			hasAuthenticatedSessionRecoveryTimedOut({
				recoveryStartedAtMs: sessionRecoveryStartedAtMs,
			})
		) {
			setSessionRecoveryTimedOut(true);
			return;
		}

		const remainingMs = Math.max(
			AUTHENTICATED_SESSION_RECOVERY_TIMEOUT_MS -
				(Date.now() - sessionRecoveryStartedAtMs),
			0,
		);
		const timeout = window.setTimeout(() => {
			setSessionRecoveryTimedOut(true);
		}, remainingMs);
		return () => window.clearTimeout(timeout);
	}, [
		shouldRecoverSession,
		sessionRecoveryStartedAtMs,
		sessionRecoveryTimedOut,
	]);

	useEffect(() => {
		if (!shouldRecoverSession || sessionRecoveryTimedOut) return;

		const recoverSession = async () => {
			try {
				await refetch();
			} catch (error) {
				console.warn("[auth] Session recovery refetch failed", error);
			} finally {
				setSessionRecoveryAttempted(true);
			}
		};

		void recoverSession();
		const interval = window.setInterval(() => {
			void recoverSession();
		}, 15_000);
		return () => window.clearInterval(interval);
	}, [refetch, shouldRecoverSession, sessionRecoveryTimedOut]);

	useEffect(() => {
		if (
			!shouldRecoverSession ||
			!sessionRecoveryAttempted ||
			sessionRecoveryTimedOut ||
			session?.user
		) {
			return;
		}

		void handleSignInAgain();
	}, [
		handleSignInAgain,
		session?.user,
		sessionRecoveryAttempted,
		sessionRecoveryTimedOut,
		shouldRecoverSession,
	]);

	// Update workspace-run pane state on terminal exit
	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (
				event.type === NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE &&
				event.data
			) {
				localStorage.setItem("lastViewedWorkspaceId", event.data.workspaceId);
				const source = event.data.source;
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: event.data.workspaceId },
					search:
						source.type === "terminal"
							? {
									terminalId: source.id,
									focusRequestId: crypto.randomUUID(),
								}
							: {
									chatSessionId: source.id,
									focusRequestId: crypto.randomUUID(),
								},
				});
				return;
			}

			if (
				event.type !== NOTIFICATION_EVENTS.TERMINAL_EXIT ||
				!event.data?.paneId
			) {
				return;
			}
			const pane = useTabsStore.getState().panes[event.data.paneId];
			if (pane?.workspaceRun?.state === "running") {
				const nextState =
					event.data.reason === "killed"
						? "stopped-by-user"
						: "stopped-by-exit";
				setPaneWorkspaceRunState(event.data.paneId, nextState);
			}
		},
	});

	useEffect(() => {
		if (!location.pathname.startsWith("/settings")) {
			setOriginRoute(location.pathname);
		}
	}, [location.pathname, setOriginRoute]);

	// Workspace initialization progress subscription
	const updateInitProgress = useWorkspaceInitStore((s) => s.updateProgress);
	electronTrpc.workspaces.onInitProgress.useSubscription(undefined, {
		onData: (progress) => {
			updateInitProgress(progress);
			if (
				progress.warning &&
				!shownWorkspaceInitWarningsRef.current.has(progress.workspaceId)
			) {
				shownWorkspaceInitWarningsRef.current.add(progress.workspaceId);
				showWorkspaceAutoNameWarningToast({
					description: progress.warning,
					onOpenModelAuthSettings: () => {
						void navigate({ to: "/settings/models" });
					},
				});
			}
			if (progress.step === "ready" || progress.step === "failed") {
				// Invalidate both the grouped list AND the specific workspace
				utils.workspaces.getAllGrouped.invalidate();
				utils.workspaces.get.invalidate({ id: progress.workspaceId });
			}
		},
		onError: (error) => {
			console.error("[workspace-init-subscription] Subscription error:", error);
		},
	});

	// Menu navigation subscription
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-settings") {
				const section = event.data.section || "account";
				navigate({ to: `/settings/${section}` as "/settings/account" });
			} else if (event.type === "open-workspace") {
				navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: event.data.workspaceId },
				});
			}
		},
	});

	if (isPending && !hasLocalToken && !env.SKIP_ENV_VALIDATION) {
		return <Navigate to="/sign-in" replace />;
	}
	if (
		(isPending || (isRefetching && !session?.user && hasLocalToken)) &&
		!sessionRecoveryTimedOut &&
		!env.SKIP_ENV_VALIDATION
	) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<Spinner className="size-8" />
			</div>
		);
	}

	if (!isSignedIn && hasLocalToken && !isOnline) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
				<HiOutlineWifi className="size-12 text-muted-foreground" />
				<div className="text-center">
					<h2 className="text-lg font-medium">You're offline</h2>
					<p className="text-sm text-muted-foreground">
						Connect to the internet to continue
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						void refetch();
					}}
				>
					Retry
				</Button>
			</div>
		);
	}

	if (shouldRecoverSession && sessionRecoveryTimedOut) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-6">
				<div className="max-w-sm text-center">
					<h2 className="text-lg font-medium">
						Your saved session could not be restored
					</h2>
					<p className="mt-2 text-sm text-muted-foreground select-text cursor-text">
						Sign in again to reconnect this device to Superset services.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setSessionRecoveryStartedAtMs(Date.now());
							setSessionRecoveryAttempted(false);
							setSessionRecoveryTimedOut(false);
							void refetch();
						}}
					>
						Retry
					</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={signOut.isPending}
						onClick={() => {
							void handleSignInAgain();
						}}
					>
						Sign in again
					</Button>
				</div>
			</div>
		);
	}

	if (shouldRecoverSession) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
				<Spinner className="size-8" />
				<div className="text-center">
					<h2 className="text-lg font-medium">Restoring your session</h2>
					<p className="text-sm text-muted-foreground">
						Reconnecting to Superset services...
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						void refetch();
					}}
				>
					Retry
				</Button>
			</div>
		);
	}

	if (!isSignedIn) {
		return <Navigate to="/sign-in" replace />;
	}

	if (!activeOrganizationId) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-6">
				<div className="max-w-sm text-center">
					<h2 className="text-lg font-medium">Account setup is incomplete</h2>
					<p className="mt-2 text-sm text-muted-foreground select-text cursor-text">
						Your session does not have an active organization. Sign out and sign
						in again, or contact support if this keeps happening.
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={() => refetch()}>
						Retry
					</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={signOut.isPending}
						onClick={() => {
							void signOut.mutateAsync();
						}}
					>
						Sign out
					</Button>
				</div>
			</div>
		);
	}

	return (
		<DndProvider manager={dragDropManager}>
			<CollectionsProvider>
				<GlobalBrowserLifecycle />
				<LocalHostServiceProvider>
					<DeletingWorkspacesProvider>
						<WorkerPoolContextProvider
							poolOptions={{ workerFactory: createPierreWorker, poolSize: 8 }}
							highlighterOptions={{ preferredHighlighter: "shiki-wasm" }}
						>
							<AgentHooks />
							<FileMenuListener />
							<V2NotificationController />
							<DaemonAutoUpdateFailureDialog />
							<Outlet />
							<WorkspaceInitEffects />
							<DashboardNewWorkspaceModal />
							<InitGitDialog />
							<TeardownLogsDialog />
							<Paywall />
						</WorkerPoolContextProvider>
					</DeletingWorkspacesProvider>
				</LocalHostServiceProvider>
			</CollectionsProvider>
		</DndProvider>
	);
}
