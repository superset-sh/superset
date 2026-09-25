import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DndProvider } from "react-dnd";
import { HiOutlineWifi } from "react-icons/hi2";
import { Paywall } from "renderer/components/Paywall";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { useSettingsExternalChangeListener } from "renderer/hooks/useSettingsExternalChangeListener";
import { useSignOut } from "renderer/hooks/useSignOut";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { DaemonAutoUpdateFailureDialog } from "renderer/routes/_authenticated/components/DaemonAutoUpdateFailureDialog";
import { DiffThemeSync } from "renderer/routes/_authenticated/components/DiffThemeSync";
import { LeaderboardAutoPublish } from "renderer/routes/_authenticated/components/LeaderboardAutoPublish";
import { PendingDeletionScreen } from "renderer/routes/_authenticated/components/PendingDeletionScreen";
import { RealtimeNudges } from "renderer/routes/_authenticated/components/RealtimeNudges";
import { StarNagObserver } from "renderer/routes/_authenticated/components/StarNagObserver";
import { V1AutoMigration } from "renderer/routes/_authenticated/components/V1AutoMigration";
import { V1ImportModal } from "renderer/routes/_authenticated/components/V1ImportModal";
import { useForwardedHotkeys } from "renderer/routes/_authenticated/hooks/useForwardedHotkeys";
import { useZoomHotkeys } from "renderer/routes/_authenticated/hooks/useZoomHotkeys";
import { useSettingsStore } from "renderer/stores/settings-state";
import { MOCK_ORG_ID, NOTIFICATION_EVENTS } from "shared/constants";
import { AgentHooks } from "./components/AgentHooks";
import { DockBadgeController } from "./components/DockBadgeController";
import { FileMenuListener } from "./components/FileMenuListener";
import { GitInitConfirmDialog } from "./components/GitInitConfirmDialog";
import { GlobalBrowserLifecycle } from "./components/GlobalBrowserLifecycle";
import { NotificationController } from "./components/NotificationController";
import { WindowTitle } from "./components/WindowTitle";
import { createPierreWorker } from "./lib/pierreWorker";
import { CollectionsProvider } from "./providers/CollectionsProvider";
import { HostWorkspacesProvider } from "./providers/HostWorkspacesProvider";
import { LocalHostServiceProvider } from "./providers/LocalHostServiceProvider";
import { SandboxAccessProvider } from "./providers/SandboxAccessProvider";

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
});

const signInRedirect = <Redirect to="/sign-in" replace />;
const createOrganizationRedirect = (
	<Redirect to="/create-organization" replace />
);
const onboardingRedirect = <Redirect to="/onboarding" replace />;

const SESSION_PENDING_TIMEOUT_MS = 15_000;

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
	// The onboarding gate below must key off the route being RENDERED, not
	// `useLocation()`. `location` is the pending navigation, so the instant the
	// redirect to /onboarding starts, the gate re-opens while `matches` still
	// holds the route we are leaving — remounting it, and re-firing its own
	// mount-time redirect, which cancels ours. The two then bounce forever
	// (DESKTOP-E3). `matches` only advances once the destination commits.
	const renderedPathname = useRouterState({
		select: (state) => state.matches[state.matches.length - 1]?.pathname ?? "",
	});
	const setOriginRoute = useSettingsStore((s) => s.setOriginRoute);

	const isSignedIn = env.SKIP_ENV_VALIDATION || !!session?.user;
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	const isAuthPending =
		(isPending || (isRefetching && !session?.user && hasLocalToken)) &&
		!env.SKIP_ENV_VALIDATION;
	const authPendingTimedOut = useDelayElapsed(
		isAuthPending,
		SESSION_PENDING_TIMEOUT_MS,
	);
	const signOut = useSignOut();
	const [isSigningOut, setIsSigningOut] = useState(false);

	useSettingsExternalChangeListener();

	// Seed the parked-terminal eviction cap from settings (SUPER-1545).
	const { data: parkedRuntimeCap } =
		electronTrpc.settings.getTerminalParkedRuntimeCap.useQuery();
	useEffect(() => {
		if (parkedRuntimeCap !== undefined) {
			terminalRuntimeRegistry.setParkedRuntimeCap(parkedRuntimeCap);
		}
	}, [parkedRuntimeCap]);

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (
				event.type === NOTIFICATION_EVENTS.FOCUS_NOTIFICATION_SOURCE &&
				event.data
			) {
				localStorage.setItem("lastViewedWorkspaceId", event.data.workspaceId);
				const source = event.data.source;
				void navigate({
					to: "/workspace/$workspaceId",
					params: { workspaceId: event.data.workspaceId },
					search: {
						terminalId: source.id,
						focusRequestId: crypto.randomUUID(),
					},
				});
			}
		},
	});

	useEffect(() => {
		if (!location.pathname.startsWith("/settings")) {
			setOriginRoute(location.pathname);
		}
	}, [location.pathname, setOriginRoute]);

	useZoomHotkeys();
	useForwardedHotkeys();

	// Menu navigation subscription
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-settings") {
				const section = event.data.section || "account";
				navigate({ to: `/settings/${section}` as "/settings/account" });
			}
		},
	});

	// Never redirect while the session is unresolved — a redirect held open
	// across re-renders loops the router until the renderer OOMs (#5729).
	if (isAuthPending) {
		return (
			<div className="relative flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
				<div className="drag absolute inset-x-0 top-0 h-12" />
				<Spinner className="size-8" />
				{authPendingTimedOut && (
					<>
						<div className="text-center select-text cursor-text">
							<h2 className="text-lg font-medium">
								Still restoring your session
							</h2>
							<p className="text-sm text-muted-foreground">
								Superset can't confirm your sign-in with the server.
							</p>
						</div>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={() => refetch()}>
								Retry
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={isSigningOut}
								onClick={async () => {
									setIsSigningOut(true);
									try {
										await signOut();
									} finally {
										void navigate({ to: "/sign-in", replace: true });
									}
								}}
							>
								Sign out
							</Button>
						</div>
					</>
				)}
			</div>
		);
	}

	if (!isSignedIn && hasLocalToken && !isOnline) {
		return (
			<div className="relative flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
				<div className="drag absolute inset-x-0 top-0 h-12" />
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
		return signInRedirect;
	}

	if (session?.user?.deletionRequestedAt) {
		return (
			<PendingDeletionScreen
				deletionRequestedAt={session.user.deletionRequestedAt}
				onReactivated={() => void refetch()}
			/>
		);
	}

	if (!activeOrganizationId) {
		return createOrganizationRedirect;
	}

	if (
		session?.user &&
		!session.user.onboardedAt &&
		!renderedPathname.startsWith("/onboarding")
	) {
		return onboardingRedirect;
	}

	return (
		<DndProvider manager={dragDropManager}>
			<CollectionsProvider>
				<WindowTitle />
				<GlobalBrowserLifecycle />
				<LocalHostServiceProvider>
					{/* Above the workspace fan-out: it needs sandbox addresses to
					    include them as hosts. */}
					<SandboxAccessProvider>
						<HostWorkspacesProvider>
							<WorkerPoolContextProvider
								poolOptions={{ workerFactory: createPierreWorker, poolSize: 8 }}
								highlighterOptions={{ preferredHighlighter: "shiki-wasm" }}
							>
								<DiffThemeSync />
								<AgentHooks />
								<FileMenuListener />
								<NotificationController />
								<DockBadgeController />
								<StarNagObserver />
								<LeaderboardAutoPublish />
								<RealtimeNudges />
								<DaemonAutoUpdateFailureDialog />
								<Outlet />
								<V1ImportModal />
								<V1AutoMigration />
								<GitInitConfirmDialog />
								<Paywall />
							</WorkerPoolContextProvider>
						</HostWorkspacesProvider>
					</SandboxAccessProvider>
				</LocalHostServiceProvider>
			</CollectionsProvider>
		</DndProvider>
	);
}
