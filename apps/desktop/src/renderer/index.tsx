import React from "react";
import ReactDom from "react-dom/client";

import { AppProviders } from "./contexts";
import { AppRoutes } from "./routes";

import "./globals.css";

// Note: StrictMode disabled due to react-dnd compatibility issues with React 19
// StrictMode causes double mounting which conflicts with HTML5Backend singleton
ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
	<AppProviders>
		<AppRoutes />
	</AppProviders>,
);
