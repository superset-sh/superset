import { initSentry } from "./lib/sentry";

initSentry();

import {
	createHashHistory,
	createRouter,
	type RouterHistory,
	RouterProvider,
} from "@tanstack/react-router";
import ReactDom from "react-dom/client";
import { posthog } from "./lib/posthog";
import { electronQueryClient } from "./providers/ElectronTRPCProvider";
import { routeTree } from "./routeTree.gen";

import "./globals.css";

const hashHistory = createHashHistory();

const router = createRouter({
	routeTree,
	history: hashHistory as RouterHistory,
	defaultPreload: "intent",
	context: {
		queryClient: electronQueryClient,
	},
});

// Track pageviews on navigation
const unsubscribe = router.subscribe("onResolved", (event) => {
	posthog.capture("$pageview", {
		$current_url: event.toLocation.pathname,
	});
});

// Clean up subscription on HMR
if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		unsubscribe();
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
	<RouterProvider router={router} />,
);
