import { Spinner } from "@superset/ui/spinner";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { DndProvider } from "react-dnd";
import { NewWorkspaceModal } from "renderer/components/NewWorkspaceModal";
import { Paywall } from "renderer/components/Paywall";
import { useUpdateListener } from "renderer/components/UpdateToast";
import { env } from "renderer/env.renderer";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { WorkspaceInitEffects } from "renderer/screens/main/components/WorkspaceInitEffects";
import { useHotkeysSync } from "renderer/stores/hotkeys";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { MOCK_ORG_ID } from "shared/constants";
import { AgentHooks } from "./components/AgentHooks";
import { CollectionsProvider } from "./providers/CollectionsProvider";

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const { data: session, isPending } = authClient.useSession();
	const hasLocalToken = !!getAuthToken();
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();

	const isSignedIn = env.SKIP_ENV_VALIDATION || !!session?.user;
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	// All hooks must be called before any conditional returns (Rules of Hooks)
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

	// If session is loading and we have a local token, show loading spinner
	// This prevents the flash of sign-in page while session validates
	if (isPending && hasLocalToken) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<Spinner className="size-8" />
			</div>
		);
	}

	// If session is loading but no local token, redirect to sign-in
	if (isPending && !hasLocalToken) {
		return <Navigate to="/sign-in" replace />;
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
				<Paywall />
			</CollectionsProvider>
		</DndProvider>
	);
}
