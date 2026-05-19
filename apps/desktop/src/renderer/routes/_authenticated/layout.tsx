import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useLiveQuery } from "@tanstack/react-db";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef } from "react";
import { DndProvider } from "react-dnd";
import { HiOutlineWifi } from "react-icons/hi2";
import { NewWorkspaceModal } from "renderer/components/NewWorkspaceModal";
import { Paywall } from "renderer/components/Paywall";
import { useUpdateListener } from "renderer/components/UpdateToast";
import { env } from "renderer/env.renderer";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { showWorkspaceAutoNameWarningToast } from "renderer/lib/workspaces/showWorkspaceAutoNameWarningToast";
import { InitGitDialog } from "renderer/react-query/projects/InitGitDialog";
import { DashboardNewWorkspaceModal } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal";
import { V1ImportModal } from "renderer/routes/_authenticated/components/V1ImportModal";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { WorkspaceInitEffects } from "renderer/screens/main/components/WorkspaceInitEffects";
import {
	STEP_ROUTES,
	selectFirstIncompleteStep,
	selectRequiredStepsComplete,
	useOnboardingStore,
} from "renderer/stores/onboarding";
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

// Outer wrapper: v1 users never instantiate the inner gate, so no live-queries
// or store subscriptions for v2 collections/state run on the v1 code path.
function V2OnboardingGate() {
	const isV2 = useIsV2CloudEnabled();
	if (!isV2) return null;
	return <V2OnboardingGateInner />;
}

function V2OnboardingGateInner() {
	const location = useLocation();
	const isOnSetup = location.pathname.startsWith("/setup");
	const dismissedForever = useOnboardingStore((s) => s.dismissedForever);
	const skippedThisLaunch = useOnboardingStore((s) => s.skippedThisLaunch);
	const skipUntilNextLaunch = useOnboardingStore((s) => s.skipUntilNextLaunch);
	const requiredComplete = useOnboardingStore(selectRequiredStepsComplete);
	const firstIncomplete = useOnboardingStore(selectFirstIncompleteStep);
	const collections = useCollections();
	const { data: v2Workspaces = [] } = useLiveQuery(
		(q) => q.from({ workspaces: collections.v2Workspaces }),
		[collections],
	);
	const hasNoV2Workspaces = v2Workspaces.length === 0;

	// Nav-away from /setup = implicit "skip for now" — gate won't re-trap them
	// this launch, but they'll see onboarding again next launch.
	const wasOnSetupRef = useRef(isOnSetup);
	const justLeftSetup = wasOnSetupRef.current && !isOnSetup;
	useLayoutEffect(() => {
		if (justLeftSetup && !skippedThisLaunch && !dismissedForever) {
			skipUntilNextLaunch();
		}
		wasOnSetupRef.current = isOnSetup;
	}, [
		isOnSetup,
		justLeftSetup,
		skippedThisLaunch,
		dismissedForever,
		skipUntilNextLaunch,
	]);

	const suppressed = dismissedForever || skippedThisLaunch || justLeftSetup;
	const shouldGate =
		hasNoV2Workspaces && !requiredComplete && !suppressed && !isOnSetup;

	if (shouldGate) {
		return <Navigate to={STEP_ROUTES[firstIncomplete]} replace />;
	}
	return null;
}

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
	const isV2CloudEnabled = useIsV2CloudEnabled();

	const isSignedIn = env.SKIP_ENV_VALIDATION || !!session?.user;
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	useAgentHookListener();
	useUpdateListener();

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
				navigate({ to: `/workspace/${event.data.workspaceId}` });
			}
		},
	});

	if (isPending && !hasLocalToken && !env.SKIP_ENV_VALIDATION) {
		return <Navigate to="/sign-in" replace />;
	}
	if (
		(isPending || (isRefetching && !session?.user && hasLocalToken)) &&
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
				<Button variant="outline" size="sm" onClick={() => refetch()}>
					Retry
				</Button>
			</div>
		);
	}

	if (!isSignedIn) {
		return <Navigate to="/sign-in" replace />;
	}

	if (!activeOrganizationId) {
		return <Navigate to="/create-organization" replace />;
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
							<V2OnboardingGate />
							<Outlet />
							<V1ImportModal />
							<WorkspaceInitEffects />
							{isV2CloudEnabled ? (
								<DashboardNewWorkspaceModal />
							) : (
								<NewWorkspaceModal />
							)}
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
