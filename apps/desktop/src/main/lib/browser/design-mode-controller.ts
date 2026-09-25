import type {
	DesignModeCancelReason,
	DesignModeSelectionResult,
} from "shared/browser-design-mode";
import { clampDesignModePayload } from "./design-mode-payload";
import { buildDesignModeScript } from "./design-mode-script";

interface ActiveDesignModeOp {
	opId: string;
	resolve: (result: DesignModeSelectionResult) => void;
	/** Detach guest listeners; skips the teardown injection when the overlay
	 *  must stay visible (selection succeeded, or a new op reuses it). */
	cleanup: (preserveOverlay?: boolean) => void;
	/** Set when a newer op replaces this one so cleanup doesn't tear down the
	 *  freshly re-armed overlay out from under it. */
	skipTeardown?: boolean;
}

/** Hard timeout for an armed selection so an abandoned op can't hang forever. */
const DESIGN_MODE_OP_TIMEOUT_MS = 120_000;

function isCancellationPayload(rawPayload: unknown): boolean {
	return (
		typeof rawPayload === "object" &&
		rawPayload !== null &&
		(rawPayload as Record<string, unknown>).__supersetDesignCancelled === true
	);
}

/**
 * Tracks at most one in-flight design-mode selection per browser pane. The
 * click is handled in-guest (Electron's before-input-event covers keyboard
 * only, not guest mouse events): the overlay's full-viewport hit-catcher
 * consumes the click and the awaitClick script resolves with the payload.
 */
export class DesignModeController {
	private readonly activeOps = new Map<string, ActiveDesignModeOp>();

	hasActiveOp(paneId: string): boolean {
		return this.activeOps.has(paneId);
	}

	cancel(paneId: string, reason: DesignModeCancelReason): void {
		const op = this.activeOps.get(paneId);
		// resolve() runs cleanup and deletes the map entry exactly once.
		op?.resolve({ opId: op.opId, kind: "cancelled", reason });
	}

	awaitSelection(
		paneId: string,
		opId: string,
		guest: Electron.WebContents,
	): Promise<DesignModeSelectionResult> {
		// One op per pane: a late click from a previous operation must not
		// resolve the wrong promise. The replaced op skips teardown so the
		// already-armed overlay survives for this op to reuse.
		const existing = this.activeOps.get(paneId);
		if (existing) {
			existing.skipTeardown = true;
			existing.resolve({
				opId: existing.opId,
				kind: "cancelled",
				reason: "user",
			});
		}

		return new Promise<DesignModeSelectionResult>((resolve) => {
			let settled = false;

			const settleOnce = (result: DesignModeSelectionResult): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				// On success the overlay stays up (frozen highlight) while the
				// renderer shows the composer; teardown happens on exit/re-arm.
				op.cleanup(result.kind === "selected");
				this.activeOps.delete(paneId);
				resolve(result);
			};

			const awaitGuestClick = async (): Promise<void> => {
				try {
					const rawPayload = await guest.executeJavaScript(
						buildDesignModeScript("awaitClick"),
					);
					if (isCancellationPayload(rawPayload)) {
						settleOnce({ opId, kind: "cancelled", reason: "user" });
						return;
					}
					const payload = clampDesignModePayload(rawPayload);
					if (!payload) {
						settleOnce({
							opId,
							kind: "error",
							reason: "Guest returned an invalid payload",
						});
						return;
					}
					settleOnce({ opId, kind: "selected", payload });
				} catch (err) {
					settleOnce({
						opId,
						kind: "error",
						reason: err instanceof Error ? err.message : "Selection failed",
					});
				}
			};

			// Only real main-frame navigations cancel: subframe loads (iframe ads,
			// embeds) and same-document navigations (pushState/hash — routine on
			// SPA dev servers) leave the document and overlay intact.
			const handleNavigation = (
				_event: unknown,
				_url: unknown,
				isInPlace: boolean,
				isMainFrame: boolean,
			): void => {
				if (isMainFrame && !isInPlace) {
					settleOnce({ opId, kind: "cancelled", reason: "navigation" });
				}
			};

			const handleDestroyed = (): void => {
				settleOnce({ opId, kind: "cancelled", reason: "destroyed" });
			};

			const timeoutId = setTimeout(() => {
				settleOnce({ opId, kind: "cancelled", reason: "timeout" });
			}, DESIGN_MODE_OP_TIMEOUT_MS);
			// An armed selection must not keep the app alive after quit.
			timeoutId.unref?.();

			guest.on("did-start-navigation", handleNavigation);
			guest.on("destroyed", handleDestroyed);

			const cleanup = (preserveOverlay?: boolean): void => {
				try {
					guest.off("did-start-navigation", handleNavigation);
					guest.off("destroyed", handleDestroyed);
				} catch {
					// The guest may already be gone; cleanup is best-effort.
				}
				if (op.skipTeardown || preserveOverlay) return;
				try {
					if (!guest.isDestroyed()) {
						void guest.executeJavaScript(buildDesignModeScript("teardown"));
					}
				} catch {
					// Best-effort overlay removal.
				}
			};

			const op: ActiveDesignModeOp = { opId, resolve: settleOnce, cleanup };
			this.activeOps.set(paneId, op);
			void awaitGuestClick();
		});
	}
}
