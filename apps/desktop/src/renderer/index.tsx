import { initSentry } from "./lib/sentry";

initSentry();

import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDom from "react-dom/client";
import { persistentHistory } from "./lib/persistent-hash-history";
import { posthog } from "./lib/posthog";
import { electronQueryClient } from "./providers/ElectronTRPCProvider";
import { routeTree } from "./routeTree.gen";

import "./globals.css";

const router = createRouter({
	routeTree,
	history: persistentHistory,
	defaultPreload: "intent",
	context: {
		queryClient: electronQueryClient,
	},
});

const unsubscribe = router.subscribe("onResolved", (event) => {
	posthog.capture("$pageview", {
		$current_url: event.toLocation.pathname,
	});
});

const handleDeepLink = (path: string) => {
	console.log("[deep-link] Navigating to:", path);
	router.navigate({ to: path });
};
window.ipcRenderer.on("deep-link-navigate", handleDeepLink);

const handleLiquidGlass = () => {
	const root = document.documentElement;
	root.classList.add("liquid-glass");
	// Remove inline styles that would override the semi-transparent CSS values
	for (const v of ["--sidebar", "--sidebar-accent", "--sidebar-border"]) {
		root.style.removeProperty(v);
	}
};
window.ipcRenderer.on("liquid-glass-active", handleLiquidGlass);

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		unsubscribe();
		window.ipcRenderer.off("deep-link-navigate", handleDeepLink);
		window.ipcRenderer.off("liquid-glass-active", handleLiquidGlass);
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
