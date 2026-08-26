import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/pages")({
	component: PagesLayout,
});

function PagesLayout() {
	return <Outlet />;
}
