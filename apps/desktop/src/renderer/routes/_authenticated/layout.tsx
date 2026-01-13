import { DndProvider } from "react-dnd";
import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "renderer/contexts/AuthProvider";
import { CollectionsProvider } from "renderer/contexts/CollectionsProvider";
import { OrganizationsProvider } from "renderer/contexts/OrganizationsProvider";
import { dragDropManager } from "renderer/lib/dnd";

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
