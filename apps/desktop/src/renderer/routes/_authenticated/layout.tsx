import {
	createFileRoute,
	Navigate,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { DndProvider } from "react-dnd";
import { NewWorkspaceModal } from "renderer/components/NewWorkspaceModal";
import { useUpdateListener } from "renderer/components/UpdateToast";
import { dragDropManager } from "renderer/lib/dnd";
import { trpc } from "renderer/lib/trpc";
import { useAuth } from "renderer/providers/AuthProvider";
import { WorkspaceInitEffects } from "renderer/screens/main/components/WorkspaceInitEffects";
import { useHotkeysSync } from "renderer/stores/hotkeys";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { CollectionsProvider } from "./providers/CollectionsProvider";
import { OrganizationsProvider } from "./providers/OrganizationsProvider";

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const { session, token } = useAuth();
	const isSignedIn = !!token && !!session?.user;
	const navigate = useNavigate();
	const utils = trpc.useUtils();

	// Global hooks and subscriptions
	useAgentHookListener();
	useUpdateListener();
	useHotkeysSync();

	// Workspace initialization progress subscription
	const updateInitProgress = useWorkspaceInitStore((s) => s.updateProgress);
	trpc.workspaces.onInitProgress.useSubscription(undefined, {
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
	trpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-settings") {
				const section = event.data.section || "account";
				navigate({ to: `/settings/${section}` as "/settings/account" });
			}
		},
	});

	if (!isSignedIn) {
		return <Navigate to="/sign-in" replace />;
	}

	return (
		<DndProvider manager={dragDropManager}>
			<CollectionsProvider>
				<OrganizationsProvider>
					<Outlet />
					<WorkspaceInitEffects />
					<NewWorkspaceModal />
				</OrganizationsProvider>
			</CollectionsProvider>
		</DndProvider>
	);
}
