import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { RootLayout } from "./-layout";
import { ErrorPage } from "./error";
import { NotFound } from "./not-found";

interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	notFoundComponent: NotFound,
	errorComponent: ErrorPage,
	onCatch: (error) => {
		console.error("[renderer] Route error caught:", error);
		void import("@sentry/electron/renderer")
			.then((Sentry) => Sentry.captureException(error))
			.catch(() => {});
	},
});

function RootComponent() {
	return (
		<RootLayout>
			<Outlet />
		</RootLayout>
	);
}
