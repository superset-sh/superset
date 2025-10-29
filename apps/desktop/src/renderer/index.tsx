import React from "react";
import ReactDom from "react-dom/client";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppRoutes } from "./routes";

import "./globals.css";

ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
	<React.StrictMode>
		<ErrorBoundary>
			<AppRoutes />
		</ErrorBoundary>
	</React.StrictMode>,
);
