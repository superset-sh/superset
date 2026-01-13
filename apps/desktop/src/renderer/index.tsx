import { initSentry } from "./lib/sentry";

initSentry();

import ReactDom from "react-dom/client";
import {
	type RouterHistory,
	RouterProvider,
	createHashHistory,
	createRouter,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

import "./globals.css";

// Create hash history for Electron file:// protocol compatibility
const hashHistory = createHashHistory();

// Create router instance
const router = createRouter({
	routeTree,
	history: hashHistory as RouterHistory,
	defaultPreload: "intent",
});

// Register router for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
	<RouterProvider router={router} />,
);
