import "./globals.css";

import { POSTHOG_COOKIE_NAME } from "@superset/shared/constants";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import posthog from "posthog-js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { env } from "./env";
import { Providers } from "./providers";
import { routeTree } from "./routeTree.gen";

if (env.NEXT_PUBLIC_POSTHOG_KEY) {
	posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
		api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
		ui_host: "https://us.posthog.com",
		defaults: "2025-11-30",
		capture_pageview: "history_change",
		capture_pageleave: true,
		capture_exceptions: true,
		debug: false,
		cross_subdomain_cookie: true,
		persistence: "cookie",
		persistence_name: POSTHOG_COOKIE_NAME,
		loaded: (client) => {
			client.register({
				app_name: "customers",
				domain: window.location.hostname,
			});
		},
	});
}

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}

createRoot(rootElement).render(
	<StrictMode>
		<Providers>
			<RouterProvider router={router} />
		</Providers>
	</StrictMode>,
);
