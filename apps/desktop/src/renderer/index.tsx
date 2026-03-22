import { initSentry } from "./lib/sentry";

initSentry();

import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDom from "react-dom/client";
import { BootErrorBoundary } from "./components/BootErrorBoundary";
import {
	cleanupBootErrorHandling,
	initBootErrorHandling,
	isBootErrorReported,
	markBootMounted,
	reportBootError,
} from "./lib/boot-errors";
import { persistentHistory } from "./lib/persistent-hash-history";
import { posthog } from "./lib/posthog";
import { electronQueryClient } from "./providers/ElectronTRPCProvider";
import { routeTree } from "./routeTree.gen";
import { useTabsStore } from "./stores/tabs/store";

import "./globals.css";
import "./styles/bundled-fonts.css";

const rootElement = document.querySelector("app");
initBootErrorHandling(rootElement);

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
interface OpenTabPayload {
	workspaceId: string;
	type: string;
	url?: string;
	focus?: boolean;
}

const handleOpenTab = (payload: OpenTabPayload) => {
	console.log(
		"[deep-link] Opening tab:",
		payload.type,
		"in workspace",
		payload.workspaceId,
	);

	if (payload.type === "webview" && payload.url) {
		useTabsStore.getState().addBrowserTab(payload.workspaceId, payload.url);

		if (payload.focus) {
			localStorage.setItem("lastViewedWorkspaceId", payload.workspaceId);
			router.navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: payload.workspaceId },
			});
		}
	}
};

const ipcRenderer = window.ipcRenderer as typeof window.ipcRenderer | undefined;
if (ipcRenderer) {
	ipcRenderer.on("deep-link-navigate", handleDeepLink);
	ipcRenderer.on("deep-link-open-tab", handleOpenTab);
} else {
	reportBootError(
		"Renderer preload not available (window.ipcRenderer missing)",
	);
}

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		unsubscribe();
		if (ipcRenderer) {
			ipcRenderer.off("deep-link-navigate", handleDeepLink);
			ipcRenderer.off("deep-link-open-tab", handleOpenTab);
		}
		cleanupBootErrorHandling();
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

if (!rootElement) {
	reportBootError("Missing <app> root element");
} else if (!isBootErrorReported()) {
	ReactDom.createRoot(rootElement).render(
		<BootErrorBoundary
			onError={(error) => reportBootError("Render failed", error)}
		>
			<RouterProvider router={router} />
		</BootErrorBoundary>,
	);
	markBootMounted();
}
