import type { Page } from "puppeteer-core";

const IDLE_TIMEOUT_MS = 5000;

/**
 * JS injected into the renderer to suppress focus-loss-triggered UI dismissals.
 *
 * How it works:
 * - Radix UI (and similar) close dropdowns/popovers when they detect focus leaving
 *   the component via blur/focusout events.
 * - When the Electron window loses OS focus (e.g., Claude Code's terminal takes over
 *   between MCP tool calls), blur fires with `relatedTarget === null`.
 * - This script suppresses those blur/focusout events in the capture phase,
 *   before React/Radix can see them.
 * - Important: on macOS, clicking a button does NOT focus it, so in-app clicks also
 *   produce blur events with `relatedTarget === null`. We distinguish window blur from
 *   click blur by checking the *original* `document.hasFocus()` — it returns `false`
 *   only when the OS window has actually lost focus.
 */
const LOCK_SCRIPT = `(() => {
	if (window.__AUTOMATION_FOCUS_LOCK__) return;
	window.__AUTOMATION_FOCUS_LOCK__ = true;

	const suppress = (e) => {
		if (e.relatedTarget === null && !document.hasFocus()) {
			e.stopImmediatePropagation();
		}
	};
	document.addEventListener('blur', suppress, true);
	document.addEventListener('focusout', suppress, true);

	window.__AUTOMATION_FOCUS_LOCK_CLEANUP__ = () => {
		document.removeEventListener('blur', suppress, true);
		document.removeEventListener('focusout', suppress, true);
		delete window.__AUTOMATION_FOCUS_LOCK__;
		delete window.__AUTOMATION_FOCUS_LOCK_CLEANUP__;
	};
})()`;

const UNLOCK_SCRIPT = `(() => {
	if (window.__AUTOMATION_FOCUS_LOCK_CLEANUP__) {
		window.__AUTOMATION_FOCUS_LOCK_CLEANUP__();
	}
})()`;

/**
 * Manages automatic focus-lock injection for the Electron renderer via CDP.
 *
 * Activates on the first automation request and auto-deactivates after
 * {@link IDLE_TIMEOUT_MS} of inactivity, so normal manual usage is unaffected.
 */
export class FocusLock {
	private locked = false;
	private timeout: ReturnType<typeof setTimeout> | null = null;

	/** Inject the lock script on navigation so it persists across page loads. */
	attach(page: Page) {
		page.on("load", async () => {
			this.locked = false;
			if (this.timeout) {
				// Re-inject if we were still in an active automation session
				await this.inject(page);
			}
		});
	}

	/** Activate (or extend) the focus lock. Call on every automation request. */
	async inject(page: Page) {
		if (!this.locked) {
			await page.evaluate(LOCK_SCRIPT);
			this.locked = true;
		}

		if (this.timeout) clearTimeout(this.timeout);
		this.timeout = setTimeout(() => this.unlock(page), IDLE_TIMEOUT_MS);
	}

	/** Deactivate the focus lock and restore normal behavior. */
	async unlock(page: Page) {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
		if (!this.locked) return;
		try {
			await page.evaluate(UNLOCK_SCRIPT);
		} catch {
			// page may have navigated or been destroyed
		}
		this.locked = false;
	}
}
