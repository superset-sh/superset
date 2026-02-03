import {
	createFileRoute,
	Navigate,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { DndProvider } from "react-dnd";
import { NewWorkspaceModal } from "renderer/components/NewWorkspaceModal";
import { Paywall } from "renderer/components/Paywall";
import { useUpdateListener } from "renderer/components/UpdateToast";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
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
	const { data: session, isPending, error } = authClient.useSession();
	const isSignedIn = env.SKIP_ENV_VALIDATION || !!session?.user;
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();

	// Track if user was ever authenticated in this session.
	// This prevents redirecting to sign-in on transient network errors.
	const wasAuthenticatedRef = useRef(false);

	// Update ref when we confirm user is authenticated
	useEffect(() => {
		if (isSignedIn) {
			wasAuthenticatedRef.current = true;
		}
	}, [isSignedIn]);

	// Global hooks and subscriptions (these don't need CollectionsProvider)
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

	// Still loading session - render nothing
	if (isPending) {
		return null;
	}

	// Transient error (network drop, backend hiccup) while user was previously authenticated.
	// Keep the authenticated UI instead of redirecting to sign-in.
	// This prevents flashing the sign-in page on temporary connectivity issues.
	if (error && !isSignedIn && wasAuthenticatedRef.current) {
		console.warn(
			"[auth] Transient error while fetching session, preserving authenticated state:",
			error,
		);
		// Continue rendering the authenticated UI - the session will recover on next successful fetch
	} else if (!isSignedIn) {
		// Confirmed signed out: no error, no session, not pending
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
