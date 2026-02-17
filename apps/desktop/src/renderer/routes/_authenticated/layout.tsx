import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { DndProvider } from "react-dnd";
import { HiOutlineWifi } from "react-icons/hi2";
import { NewWorkspaceModal } from "renderer/components/NewWorkspaceModal";
import { Paywall } from "renderer/components/Paywall";
import { useUpdateListener } from "renderer/components/UpdateToast";
import { env } from "renderer/env.renderer";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { WorkspaceInitEffects } from "renderer/screens/main/components/WorkspaceInitEffects";
import { useHotkeysSync } from "renderer/stores/hotkeys";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { MOCK_ORG_ID } from "shared/constants";
import { AgentHooks } from "./components/AgentHooks";
import { TeardownLogsDialog } from "./components/TeardownLogsDialog";
import { CollectionsProvider } from "./providers/CollectionsProvider";

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
	const utils = electronTrpc.useUtils();

	const isSignedIn = env.SKIP_ENV_VALIDATION || !!session?.user;
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	useAgentHookListener();
	useUpdateListener();
	useHotkeysSync();

	// Workspace initialization progress subscription
	const updateInitProgress = useWorkspaceInitStore((s) => s.updateProgress);
	electronTrpc.workspaces.onInitProgress.useSubscription(undefined, {
		onData: (progress) => {
			updateInitProgress(progress);
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
				<AgentHooks />
				<Outlet />
				<WorkspaceInitEffects />
				<NewWorkspaceModal />
				<TeardownLogsDialog />
				<Paywall />
			</CollectionsProvider>
		</DndProvider>
	);
}
