/**
 * Target-domain emulation for a pane's CDP endpoint.
 *
 * A browser-level CDP client (browser-use, Playwright) attaches to the endpoint,
 * calls `Target.getTargets`, finds a `type: "page"` target, and attaches to it.
 * Electron's guest debugger answers `Target.*` with the whole process's target
 * list — the webview shows up as `type: "webview"` and the host app shell as a
 * `file://` `type: "page"` — so such a client attaches to the wrong target and
 * reads an empty page. These helpers present the pane as a single `page` target
 * and bind a synthetic flatten session to the debugger's root (session-less)
 * channel, which already routes to the guest webview.
 *
 * Kept free of Electron imports so the logic is unit-testable in isolation; the
 * live wiring lives in `browser-manager.ts`.
 */

export interface ShimIds {
	targetId: string;
	sessionId: string;
	browserContextId: string;
}

export function shimIds(paneId: string): ShimIds {
	return {
		targetId: `pane-${paneId}`,
		sessionId: `pane-session-${paneId}`,
		browserContextId: `pane-context-${paneId}`,
	};
}

export interface TargetInfoInput {
	ids: ShimIds;
	url: string;
	title: string;
	attached: boolean;
}

export function syntheticTargetInfo(i: TargetInfoInput) {
	return {
		targetId: i.ids.targetId,
		type: "page",
		title: i.title,
		url: i.url,
		attached: i.attached,
		canAccessOpener: false,
		browserContextId: i.ids.browserContextId,
	};
}

export interface TargetCommandContext {
	ids: ShimIds;
	url: string;
	title: string;
	flatSessionId: string | null;
	autoAttachEmitted: boolean;
}

export interface TargetCommandResult {
	/** Events to emit before the reply (e.g. a synthesized attachedToTarget). */
	events: Array<Record<string, unknown>>;
	/** The result payload for the command's reply. */
	result: Record<string, unknown>;
	flatSessionId: string | null;
	autoAttachEmitted: boolean;
	/**
	 * A URL the caller should navigate the pane to after replying. Set only for
	 * `Target.createTarget` with a concrete url — real CDP navigates the new
	 * target to it, and since we reuse the pane as that target, the caller
	 * performs the navigation (subject to its own scheme allowlist).
	 */
	navigateTo?: string;
}

/**
 * Handle a `Target.*` command against the single-pane emulation. Returns null
 * when `method` is not a Target-domain command (the caller forwards those).
 */
export function handleTargetCommand(
	method: string,
	params: unknown,
	ctx: TargetCommandContext,
): TargetCommandResult | null {
	if (!method.startsWith("Target.")) return null;

	let flatSessionId = ctx.flatSessionId;
	let autoAttachEmitted = ctx.autoAttachEmitted;
	let navigateTo: string | undefined;
	const events: Array<Record<string, unknown>> = [];
	const info = () =>
		syntheticTargetInfo({
			ids: ctx.ids,
			url: ctx.url,
			title: ctx.title,
			attached: flatSessionId !== null,
		});
	const done = (result: Record<string, unknown>): TargetCommandResult => ({
		events,
		result,
		flatSessionId,
		autoAttachEmitted,
		navigateTo,
	});
	// Emit detachedFromTarget for the synthetic session and forget it, matching
	// CDP's teardown contract (detachFromTarget / setAutoAttach:false).
	const detach = () => {
		if (flatSessionId) {
			events.push({
				method: "Target.detachedFromTarget",
				params: { sessionId: flatSessionId, targetId: ctx.ids.targetId },
			});
			flatSessionId = null;
			autoAttachEmitted = false;
		}
	};

	switch (method) {
		case "Target.getTargets":
			return done({ targetInfos: [info()] });
		case "Target.getTargetInfo":
			return done({ targetInfo: info() });
		case "Target.attachToTarget":
			flatSessionId = ctx.ids.sessionId;
			return done({ sessionId: ctx.ids.sessionId });
		case "Target.createTarget": {
			// A single pane can't spawn tabs, so hand back this same target — the
			// client then drives it, which reuses the pane. Real CDP navigates the
			// new target to the requested url, so mirror that: reuse + navigate.
			flatSessionId = ctx.ids.sessionId;
			const url = (params as { url?: unknown } | undefined)?.url;
			if (typeof url === "string" && url !== "" && url !== "about:blank") {
				navigateTo = url;
			}
			return done({ targetId: ctx.ids.targetId });
		}
		case "Target.setAutoAttach":
			if ((params as { autoAttach?: boolean } | undefined)?.autoAttach) {
				if (!autoAttachEmitted) {
					flatSessionId = ctx.ids.sessionId;
					autoAttachEmitted = true;
					events.push({
						method: "Target.attachedToTarget",
						params: {
							sessionId: ctx.ids.sessionId,
							targetInfo: info(),
							waitingForDebugger: false,
						},
					});
				}
			} else {
				// Disabling auto-attach detaches related sessions.
				detach();
			}
			return done({});
		case "Target.detachFromTarget":
			detach();
			return done({});
		case "Target.closeTarget":
			// Don't destroy the user's pane on a client disconnect; acknowledge
			// without closing.
			return done({ success: true });
		default:
			// activateTarget, setDiscoverTargets, …
			return done({});
	}
}

/**
 * The sessionId to forward to the guest debugger: the synthetic flatten session
 * maps to the debugger's root (session-less) channel, so strip it; any other
 * sessionId (a real child session) passes through unchanged.
 */
export function forwardSessionFor(
	sessionId: string | undefined,
	flatSessionId: string | null,
): string | undefined {
	return sessionId && sessionId === flatSessionId ? undefined : sessionId;
}

/**
 * The sessionId to stamp on an outbound event. Root events carry no sessionId;
 * once the client has taken the synthetic flatten session, tag them with it so
 * its per-session event routing matches (real flatten mode tags page events
 * this way).
 */
export function tagEventSession(
	sessionId: string | undefined,
	flatSessionId: string | null,
): string | undefined {
	return sessionId ?? flatSessionId ?? undefined;
}
