import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { DndProvider } from "react-dnd";
import { dragDropManager } from "renderer/lib/dnd";
import { useAuth } from "renderer/providers/AuthProvider";
import { CollectionsProvider } from "./providers/CollectionsProvider";
import { OrganizationsProvider } from "./providers/OrganizationsProvider";

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const { session, token } = useAuth();
	const isSignedIn = !!token && !!session?.user;

	if (!isSignedIn) {
		return <Navigate to="/sign-in" replace />;
	}

	return (
		<DndProvider manager={dragDropManager}>
			<CollectionsProvider>
				<OrganizationsProvider>
					<Outlet />
				</OrganizationsProvider>
			</CollectionsProvider>
		</DndProvider>
	);
}
