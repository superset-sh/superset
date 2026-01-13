import { createRootRoute, Outlet } from "@tanstack/react-router";
import { RootLayout } from "./layout";
import { NotFound } from "./not-found";

export const Route = createRootRoute({
	component: RootComponent,
	notFoundComponent: NotFound,
});

function RootComponent() {
	return (
		<RootLayout>
			<Outlet />
		</RootLayout>
	);
}
