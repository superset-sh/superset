import { initSentry } from "./lib/sentry";

initSentry();

import {
	createHashHistory,
	createRouter,
	type RouterHistory,
	RouterProvider,
} from "@tanstack/react-router";
import ReactDom from "react-dom/client";
import { queryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";

import "./globals.css";

const hashHistory = createHashHistory();

const router = createRouter({
	routeTree,
	history: hashHistory as RouterHistory,
	defaultPreload: "intent",
	context: {
		queryClient,
	},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
	<RouterProvider router={router} />,
);
