import { Toaster } from "@superset/ui/sonner";
import React from "react";
import ReactDom from "react-dom/client";

import { AppProviders } from "./contexts";
import { AppRoutes } from "./routes";

import "./globals.css";

ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
	<React.StrictMode>
		<AppProviders>
			<AppRoutes />
			<Toaster />
		</AppProviders>
	</React.StrictMode>,
);
