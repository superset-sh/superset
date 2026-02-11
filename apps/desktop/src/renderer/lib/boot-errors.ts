let bootErrorReported = false;
let hasMounted = false;
let rootElement: Element | null = null;
let listenersAttached = false;

const renderBootError = (message: string, error?: unknown) => {
	if (bootErrorReported) return;
	bootErrorReported = true;

	const container = rootElement ?? document.body;
	const wrapper = document.createElement("div");
	wrapper.style.display = "flex";
	wrapper.style.height = "100vh";
	wrapper.style.alignItems = "center";
	wrapper.style.justifyContent = "center";
	wrapper.style.background = "#0f0f0f";
	wrapper.style.color = "#e5e5e5";
	wrapper.style.fontFamily = "system-ui, sans-serif";
	wrapper.style.padding = "24px";
	wrapper.style.textAlign = "center";

	const inner = document.createElement("div");
	inner.style.maxWidth = "520px";

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

	if (error) {
		let errorText = "Unknown error";
		if (error instanceof Error) {
			errorText = error.message;
		} else if (typeof error === "string") {
			errorText = error;
		} else {
			try {
				errorText = JSON.stringify(error);
			} catch {
				errorText = String(error);
			}
		}
		const pre = document.createElement("pre");
		pre.textContent = errorText;
		pre.style.marginTop = "12px";
		pre.style.fontSize = "12px";
		pre.style.opacity = "0.7";
		pre.style.whiteSpace = "pre-wrap";
		inner.appendChild(pre);
	}

	wrapper.appendChild(inner);
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
