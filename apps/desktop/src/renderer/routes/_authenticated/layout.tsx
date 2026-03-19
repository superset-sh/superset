import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { DndProvider } from "react-dnd";
import { HiOutlineWifi } from "react-icons/hi2";
import { NewWorkspaceModal } from "renderer/components/NewWorkspaceModal";
import { Paywall } from "renderer/components/Paywall";
import { useUpdateListener } from "renderer/components/UpdateToast";
import { ConnectedWorktreeChoiceDialog } from "renderer/components/WorktreeChoiceDialog/ConnectedWorktreeChoiceDialog";
import { env } from "renderer/env.renderer";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { showWorkspaceAutoNameWarningToast } from "renderer/lib/workspaces/showWorkspaceAutoNameWarningToast";
import { InitGitDialog } from "renderer/react-query/projects/InitGitDialog";
import { DashboardNewWorkspaceModal } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal";
import { WorkspaceInitEffects } from "renderer/screens/main/components/WorkspaceInitEffects";
import { useHotkeysSync } from "renderer/stores/hotkeys";
import { useSettingsStore } from "renderer/stores/settings-state";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { useTabsSync } from "renderer/stores/tabs/useTabsSync";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { MOCK_ORG_ID } from "shared/constants";
import { AgentHooks } from "./components/AgentHooks";
import { TeardownLogsDialog } from "./components/TeardownLogsDialog";
import { CollectionsProvider } from "./providers/CollectionsProvider";
import { HostServiceProvider } from "./providers/HostServiceProvider";

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
	const isV2CloudEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V2_CLOUD) ?? false;

	const isSignedIn = env.SKIP_ENV_VALIDATION || !!session?.user;
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	useAgentHookListener();
	useUpdateListener();
	useHotkeysSync();
	useTabsSync();

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

	// Cross-window project data sync (worktree mode, name, color, etc.)
	electronTrpc.projects.onProjectChanged.useSubscription(undefined, {
		onData: () => {
			utils.workspaces.getAllGrouped.invalidate();
			utils.projects.getRecents.invalidate();
		},
	});

	// Terminal zoom via menu/hotkeys
	const setFontSettings = electronTrpc.settings.setFontSettings.useMutation({
		onSuccess: () => utils.settings.getFontSettings.invalidate(),
	});

	// Menu navigation subscription
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-settings") {
				const section = event.data.section || "account";
				navigate({ to: `/settings/${section}` as "/settings/account" });
			} else if (event.type === "open-workspace") {
				navigate({ to: `/workspace/${event.data.workspaceId}` });
			} else if (
				event.type === "terminal-zoom-in" ||
				event.type === "terminal-zoom-out"
			) {
				const delta = event.type === "terminal-zoom-in" ? 1 : -1;
				utils.settings.getFontSettings
					.fetch()
					.then((fontSettings) => {
						const current = fontSettings?.terminalFontSize ?? 14;
						const next = Math.max(10, Math.min(24, current + delta));
						if (next !== current) {
							setFontSettings.mutate({ terminalFontSize: next });
						}
					})
					.catch((error: unknown) => {
						console.error(
							"[terminal-zoom] Failed to fetch font settings:",
							error,
						);
					});
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
				<HostServiceProvider>
					<AgentHooks />
					<Outlet />
					<WorkspaceInitEffects />
					{isV2CloudEnabled ? (
						<DashboardNewWorkspaceModal />
					) : (
						<NewWorkspaceModal />
					)}
					<InitGitDialog />
					<ConnectedWorktreeChoiceDialog />
					<TeardownLogsDialog />
					<Paywall />
				</HostServiceProvider>
			</CollectionsProvider>
		</DndProvider>
	);
}
