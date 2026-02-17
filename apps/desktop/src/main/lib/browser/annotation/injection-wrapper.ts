/**
 * Injection wrapper for the agentation annotation overlay.
 *
 * This script is designed to be bundled into an IIFE and injected into
 * a webview via `evaluateJS`. It:
 *   1. Creates a container `<div id="superset-annotation-root">` in the page
 *   2. Renders the `<Agentation>` component into it
 *   3. Reads `window.__supersetWebhookUrl` (set by BrowserManager before injection)
 *      and passes it as the `webhookUrl` prop
 *   4. Intercepts `fetch` calls to the webhook URL so they bypass CSP/CORS —
 *      routes the JSON body through `console.log` → Electron's console-message
 *      event, which the main process picks up reliably
 *   5. Keeps `webhooksEnabled: false` so the manual "Send" button is always visible
 *   6. `onAnnotationAdd` fires a manual webhook POST when auto-send is enabled
 *      (intercepted by the same fetch shim)
 *   7. Injects an auto-send toggle button into agentation's toolbar
 *   8. Hides the MCP/Webhooks settings section (used internally)
 *   9. Exposes `window.__supersetAnnotation` for control from the main process
 */

import type { AgentationProps, Annotation } from "agentation";
import { Agentation } from "agentation";
import React from "react";
import ReactDOM from "react-dom/client";

const CONTAINER_ID = "superset-annotation-root";
const SETTINGS_KEY = "feedback-toolbar-settings";
const WEBHOOK_MARKER = "$SUPERSET_WEBHOOK$";

// State
let currentAnnotations: Annotation[] = [];
let reactRoot: ReactDOM.Root | null = null;
let autoSendEnabled = false;
let fetchInterceptInstalled = false;

// ── Fetch intercept ─────────────────────────────────────────────────────

/**
 * Override `window.fetch` so that any POST to our webhook URL is routed
 * through `console.log` instead of the network. The Electron main process
 * listens for `console-message` events and picks up the JSON body.
 *
 * This completely bypasses CSP `connect-src` restrictions and mixed-content
 * blocking that prevent webview pages from fetching localhost.
 */
function installFetchIntercept(webhookUrl: string) {
	if (fetchInterceptInstalled || !webhookUrl) return;
	fetchInterceptInstalled = true;

	const originalFetch = window.fetch;
	window.fetch = function fetchOverride(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		// Resolve the URL being fetched
		let targetUrl: string;
		if (typeof input === "string") {
			targetUrl = input;
		} else if (input instanceof URL) {
			targetUrl = input.href;
		} else {
			targetUrl = (input as Request).url;
		}

		if (targetUrl === webhookUrl) {
			const body = init?.body ?? (input instanceof Request ? null : null);
			if (body && typeof body === "string") {
				console.log(WEBHOOK_MARKER + body);
			}
			// Return a fake 200 so agentation thinks the webhook succeeded
			return Promise.resolve(
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		return originalFetch.call(window, input, init);
	};
}

// ── Toolbar injection helpers ───────────────────────────────────────────

// Lightning bolt SVG for the auto-send toggle button
const BOLT_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

function injectToolbarButton() {
	const observer = new MutationObserver(() => {
		const toolbar = document.querySelector("[data-feedback-toolbar]");
		if (!toolbar) return;

		// Find the controls content div (visible when toolbar is expanded).
		// It's the second direct child of the toolbar container.
		const container = toolbar.firstElementChild as HTMLElement | null;
		if (!container) return;
		const controlsContent = container.children[1] as HTMLElement | null;
		if (!controlsContent) return;

		// Don't inject twice
		if (controlsContent.querySelector("[data-superset-autosend]")) return;

		// Find the divider (child with no button inside, used as separator)
		const children = Array.from(controlsContent.children);
		const dividerIndex = children.findIndex(
			(child) =>
				child.childElementCount === 0 &&
				child.tagName === "DIV" &&
				(child as HTMLElement).offsetWidth < 5,
		);
		if (dividerIndex === -1) return;

		// Create the auto-send toggle button wrapper
		const wrapper = document.createElement("div");
		wrapper.setAttribute("data-superset-autosend", "true");
		// Copy the style from a sibling button wrapper for consistency
		const siblingWrapper = children[0] as HTMLElement;
		if (siblingWrapper) {
			wrapper.className = siblingWrapper.className;
		}
		wrapper.style.position = "relative";

		const btn = document.createElement("button");
		// Copy button style from the first button in the toolbar
		const siblingBtn = siblingWrapper?.querySelector("button");
		if (siblingBtn) {
			btn.className = siblingBtn.className;
		}
		btn.innerHTML = BOLT_SVG;
		btn.style.opacity = autoSendEnabled ? "1" : "0.4";
		btn.style.color = autoSendEnabled ? "#fbbf24" : "currentColor";
		btn.title = autoSendEnabled
			? "Auto-send: ON (each annotation opens a tab)"
			: "Auto-send: OFF";
		btn.onclick = (e) => {
			e.stopPropagation();
			autoSendEnabled = !autoSendEnabled;
			btn.style.opacity = autoSendEnabled ? "1" : "0.4";
			btn.style.color = autoSendEnabled ? "#fbbf24" : "currentColor";
			btn.title = autoSendEnabled
				? "Auto-send: ON (each annotation opens a tab)"
				: "Auto-send: OFF";
			// Update the tooltip
			const tip = wrapper.querySelector(
				"[data-superset-tooltip]",
			) as HTMLElement | null;
			if (tip)
				tip.textContent = autoSendEnabled ? "Auto-send ON" : "Auto-send OFF";
		};

		// Add tooltip span matching agentation's style
		const tooltip = document.createElement("span");
		tooltip.setAttribute("data-superset-tooltip", "true");
		// Find tooltip class from sibling
		const siblingTooltip = siblingWrapper?.querySelector("span:not(:has(svg))");
		if (siblingTooltip) {
			tooltip.className = siblingTooltip.className;
		}
		tooltip.textContent = autoSendEnabled ? "Auto-send ON" : "Auto-send OFF";

		wrapper.appendChild(btn);
		wrapper.appendChild(tooltip);

		// Insert before the divider
		controlsContent.insertBefore(wrapper, children[dividerIndex]);

		// Stop observing once injected
		observer.disconnect();
	});

	observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Hide the "Manage MCP & Webhooks" settings section since we use the webhook
 * internally. We do this via a MutationObserver that removes the nav link and
 * automations page when they appear.
 */
function hideWebhookSettings() {
	const observer = new MutationObserver(() => {
		const toolbar = document.querySelector("[data-feedback-toolbar]");
		if (!toolbar) return;

		// Find and hide the "Manage MCP & Webhooks" nav link
		const buttons = toolbar.querySelectorAll("button");
		for (const btn of buttons) {
			if (btn.textContent?.includes("Manage MCP")) {
				const section = btn.closest("div");
				if (section?.parentElement) {
					(section as HTMLElement).style.display = "none";
				}
			}
		}
	});

	observer.observe(document.body, { childList: true, subtree: true });
}

// ── Main mount/destroy ──────────────────────────────────────────────────

function mount() {
	// Avoid double mount
	if (document.getElementById(CONTAINER_ID)) return;

	// Read the webhook URL set by BrowserManager before bundle injection.
	// biome-ignore lint/suspicious/noExplicitAny: global injection
	const webhookUrl: string = (window as any).__supersetWebhookUrl || "";

	// Install fetch intercept BEFORE agentation mounts, so all its webhook
	// calls are caught from the start.
	installFetchIntercept(webhookUrl);

	// Always keep webhooksEnabled=false so the manual "Send" button stays visible.
	// Auto-send is handled by our onAnnotationAdd callback below.
	try {
		const existing = localStorage.getItem(SETTINGS_KEY);
		if (existing) {
			const parsed = JSON.parse(existing);
			parsed.webhooksEnabled = false;
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
		} else {
			localStorage.setItem(
				SETTINGS_KEY,
				JSON.stringify({ webhooksEnabled: false }),
			);
		}
	} catch {
		// localStorage may not be available
	}

	const container = document.createElement("div");
	container.id = CONTAINER_ID;
	container.style.cssText =
		"position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
	document.body.appendChild(container);

	reactRoot = ReactDOM.createRoot(container);

	const props: AgentationProps = {
		copyToClipboard: false,
		webhookUrl,
		onAnnotationAdd: (annotation: Annotation) => {
			currentAnnotations = [...currentAnnotations, annotation];
			// When auto-send is enabled, fire the webhook manually for this
			// annotation. The fetch intercept routes it through console.log
			// so it reaches the Electron main process reliably.
			if (autoSendEnabled && webhookUrl) {
				fetch(webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						event: "annotation.add",
						timestamp: Date.now(),
						url: window.location.href,
						annotation,
					}),
				}).catch(() => {});
			}
		},
		onAnnotationDelete: (annotation: Annotation) => {
			currentAnnotations = currentAnnotations.filter(
				(a) => a.id !== annotation.id,
			);
		},
		onAnnotationUpdate: (annotation: Annotation) => {
			currentAnnotations = currentAnnotations.map((a) =>
				a.id === annotation.id ? annotation : a,
			);
		},
		onAnnotationsClear: () => {
			currentAnnotations = [];
		},
		onSubmit: (_output: string, annotations: Annotation[]) => {
			currentAnnotations = annotations;
		},
	};

	reactRoot.render(
		// biome-ignore lint/suspicious/noExplicitAny: React.createElement types are strict about Attributes
		React.createElement(Agentation as any, props),
	);

	// Inject our custom toolbar button and hide webhook settings after agentation mounts
	injectToolbarButton();
	hideWebhookSettings();
}

function destroy() {
	if (reactRoot) {
		reactRoot.unmount();
		reactRoot = null;
	}
	const container = document.getElementById(CONTAINER_ID);
	if (container) {
		container.remove();
	}
	currentAnnotations = [];
	autoSendEnabled = false;
}

function getAnnotations(): Annotation[] {
	return currentAnnotations;
}

// Expose control API on window
// biome-ignore lint/suspicious/noExplicitAny: global injection
(window as any).__supersetAnnotation = {
	destroy,
	getAnnotations,
	mount,
	get autoSendEnabled() {
		return autoSendEnabled;
	},
	set autoSendEnabled(v: boolean) {
		autoSendEnabled = v;
	},
};

// Auto-mount on injection
mount();
