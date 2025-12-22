import React from "react";
import ReactDom from "react-dom/client";

import { ThemedToaster } from "./components/ThemedToaster";
import { UpdateToast } from "./components/UpdateToast";
import { AppProviders } from "./contexts";
import { AppRoutes } from "./routes";

import "./globals.css";

ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
	<React.StrictMode>
		<AppProviders>
			<AppRoutes />
			<ThemedToaster />
			<UpdateToast />
		</AppProviders>
	</React.StrictMode>,
);
