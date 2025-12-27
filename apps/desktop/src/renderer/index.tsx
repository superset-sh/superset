import { initSentry } from "./lib/sentry";

initSentry();

import React from "react";
import ReactDom from "react-dom/client";

import { ThemedToaster } from "./components/ThemedToaster";
import { AppProviders } from "./contexts";
import { AppRoutes } from "./routes";

import "./globals.css";

ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
	<React.StrictMode>
		<AppProviders>
			<AppRoutes />
			<ThemedToaster />
		</AppProviders>
	</React.StrictMode>,
);
