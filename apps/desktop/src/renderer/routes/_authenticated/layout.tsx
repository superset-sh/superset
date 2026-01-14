import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { DndProvider } from "react-dnd";
import { authClient } from "renderer/lib/auth-client";
import { dragDropManager } from "renderer/lib/dnd";
import { CollectionsProvider } from "./providers/CollectionsProvider";

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const { data: session, isPending, error } = authClient.useSession();

	// Session still loading - show spinner
	if (isPending) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	// Error or no user - not authenticated, redirect to sign-in
	if (error || !session?.user) {
		return <Navigate to="/sign-in" replace />;
	}

	return (
		<DndProvider manager={dragDropManager}>
			<CollectionsProvider>
				<Outlet />
			</CollectionsProvider>
		</DndProvider>
	);
}
