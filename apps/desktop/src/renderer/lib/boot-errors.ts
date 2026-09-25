import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { failureLayoutStyles } from "../components/FailureLayout/styles";

import { failureDiagnostic } from "./failure-diagnostic/failure-diagnostic";

let bootErrorReported = false;
let hasMounted = false;
let rootElement: Element | null = null;
let listenersAttached = false;

const renderBootError = (message: string, error?: unknown) => {
	if (bootErrorReported) return;
	bootErrorReported = true;

	const container = rootElement ?? document.body;
	const wrapper = document.createElement("div");
	wrapper.dataset.desktopFailureLayout = "";
	Object.assign(wrapper.style, failureLayoutStyles.frame);
	const titleBar = document.createElement("div");
	titleBar.setAttribute("aria-hidden", "true");
	Object.assign(titleBar.style, failureLayoutStyles.titleBar);
	titleBar.style.setProperty(
		"-webkit-app-region",
		failureLayoutStyles.titleBar.WebkitAppRegion,
	);
	const content = document.createElement("main");
	Object.assign(content.style, failureLayoutStyles.content);
	content.style.setProperty(
		"-webkit-app-region",
		failureLayoutStyles.content.WebkitAppRegion,
	);
	wrapper.append(titleBar, content);

	const inner = document.createElement("div");
	inner.style.maxWidth = "520px";
	inner.style.margin = "10vh auto 0";
	inner.style.textAlign = "center";

	const title = document.createElement("div");
	title.textContent = "Superset failed to start";
	title.style.fontSize = "18px";
	title.style.marginBottom = "8px";

	const detail = document.createElement("div");
	detail.textContent = message;
	detail.style.fontSize = "14px";
	detail.style.opacity = "0.8";

	inner.appendChild(title);
	inner.appendChild(detail);

	const reload = document.createElement("button");
	reload.type = "button";
	reload.textContent = i18n._(msg({ message: "Reload" }));
	Object.assign(reload.style, {
		marginTop: "16px",
		padding: "8px 20px",
		borderRadius: "6px",
		border: "1px solid #555",
		background: "#333",
		color: "#e5e5e5",
		cursor: "pointer",
	});
	reload.addEventListener("click", () => window.location.reload());
	inner.appendChild(reload);

	if (error !== undefined) {
		const pre = document.createElement("pre");
		pre.textContent = failureDiagnostic(error);
		pre.style.marginTop = "12px";
		pre.style.fontSize = "12px";
		pre.style.opacity = "0.7";
		pre.style.whiteSpace = "pre-wrap";
		pre.style.overflowWrap = "anywhere";
		inner.appendChild(pre);
	}

	content.appendChild(inner);
	container.replaceChildren(wrapper);
};

export const reportBootError = (message: string, error?: unknown) => {
	console.error("[renderer] Boot error:", message, error);
	if (hasMounted) return;
	renderBootError(message, error);
};

const handleGlobalError = (event: ErrorEvent) => {
	if (hasMounted) return;
	reportBootError(event.message || "Unhandled error", event.error);
};

const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
	if (hasMounted) return;
	reportBootError("Unhandled promise rejection", event.reason);
};

export const initBootErrorHandling = (root: Element | null) => {
	rootElement = root;
	if (listenersAttached) return;
	listenersAttached = true;
	window.addEventListener("error", handleGlobalError);
	window.addEventListener("unhandledrejection", handleUnhandledRejection);
};

export const cleanupBootErrorHandling = () => {
	if (!listenersAttached) return;
	listenersAttached = false;
	window.removeEventListener("error", handleGlobalError);
	window.removeEventListener("unhandledrejection", handleUnhandledRejection);
};

export const markBootMounted = () => {
	hasMounted = true;
};

export const isBootErrorReported = () => bootErrorReported;
