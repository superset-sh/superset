import { describe, expect, test } from "bun:test";
import { DesignModeController } from "./design-mode-controller";

type Handler = (...args: unknown[]) => void;

// Present only in the teardown script (the awaitClick script assigns
// `design.cancelAwait = ...` but never guards on a missing design object).
const TEARDOWN_MARKER = "if (!design) return true";

/** Minimal guest double: records injected scripts, lets tests settle the
 *  awaitClick call, and can fire navigation/destroyed events. */
function makeGuest() {
	const handlers = new Map<string, Set<Handler>>();
	const injected: string[] = [];
	let pendingResolve: ((value: unknown) => void) | null = null;
	let pendingReject: ((err: unknown) => void) | null = null;

	const guest = {
		isDestroyed: () => false,
		on: (event: string, handler: Handler) => {
			let set = handlers.get(event);
			if (!set) {
				set = new Set();
				handlers.set(event, set);
			}
			set.add(handler);
		},
		off: (event: string, handler: Handler) => {
			handlers.get(event)?.delete(handler);
		},
		executeJavaScript: (script: string) => {
			injected.push(script);
			if (script.includes("await new Promise")) {
				// The awaitClick script — stays pending until the test settles it.
				return new Promise((resolve, reject) => {
					pendingResolve = resolve;
					pendingReject = reject;
				});
			}
			return Promise.resolve(true);
		},
	};

	return {
		guest: guest as unknown as Electron.WebContents,
		injected,
		emit: (event: string, ...args: unknown[]) => {
			for (const handler of handlers.get(event) ?? []) handler(...args);
		},
		resolveClick: (value: unknown) => pendingResolve?.(value),
		rejectClick: (err: unknown) => pendingReject?.(err),
	};
}

function validRawPayload(): Record<string, unknown> {
	return {
		page: { sanitizedUrl: "http://localhost:3000/", title: "t" },
		target: {
			tagName: "div",
			selector: "div",
			accessibility: {},
			rectViewport: { x: 0, y: 0, width: 10, height: 10 },
			rectPage: { x: 0, y: 0, width: 10, height: 10 },
			computedStyles: {},
		},
	};
}

describe("DesignModeController", () => {
	test("resolves selected with a clamped payload on click", async () => {
		const controller = new DesignModeController();
		const { guest, resolveClick } = makeGuest();
		const resultPromise = controller.awaitSelection("pane-1", "op-1", guest);
		resolveClick(validRawPayload());
		const result = await resultPromise;
		expect(result.kind).toBe("selected");
		if (result.kind === "selected") {
			expect(result.payload.target.tagName).toBe("div");
		}
		expect(controller.hasActiveOp("pane-1")).toBe(false);
	});

	test("classifies the guest cancellation marker as user cancel", async () => {
		const controller = new DesignModeController();
		const { guest, resolveClick } = makeGuest();
		const resultPromise = controller.awaitSelection("pane-1", "op-1", guest);
		resolveClick({ __supersetDesignCancelled: true });
		const result = await resultPromise;
		expect(result).toEqual({ opId: "op-1", kind: "cancelled", reason: "user" });
	});

	test("rejects a structurally invalid guest payload as an error", async () => {
		const controller = new DesignModeController();
		const { guest, resolveClick } = makeGuest();
		const resultPromise = controller.awaitSelection("pane-1", "op-1", guest);
		resolveClick({ page: "not-an-object" });
		const result = await resultPromise;
		expect(result.kind).toBe("error");
	});

	test("cancel() settles the op and injects teardown", async () => {
		const controller = new DesignModeController();
		const { guest, injected } = makeGuest();
		const resultPromise = controller.awaitSelection("pane-1", "op-1", guest);
		controller.cancel("pane-1", "user");
		const result = await resultPromise;
		expect(result).toEqual({ opId: "op-1", kind: "cancelled", reason: "user" });
		expect(injected.some((s) => s.includes(TEARDOWN_MARKER))).toBe(true);
	});

	test("main-frame navigation cancels; subframe and in-place do not", async () => {
		const controller = new DesignModeController();
		const { guest, emit, resolveClick } = makeGuest();
		const first = controller.awaitSelection("pane-1", "op-1", guest);
		emit("did-start-navigation", {}, "url", false, false);
		expect(controller.hasActiveOp("pane-1")).toBe(true);
		// Same-document navigation (pushState/hash) must not cancel either.
		emit("did-start-navigation", {}, "url", true, true);
		expect(controller.hasActiveOp("pane-1")).toBe(true);
		emit("did-start-navigation", {}, "url", false, true);
		const result = await first;
		expect(result).toEqual({
			opId: "op-1",
			kind: "cancelled",
			reason: "navigation",
		});
		// The guest promise is still pending; settle it so nothing leaks.
		resolveClick({ __supersetDesignCancelled: true });
	});

	test("a new op replaces the old one without tearing down the overlay", async () => {
		const controller = new DesignModeController();
		const first = makeGuest();
		const firstPromise = controller.awaitSelection(
			"pane-1",
			"op-1",
			first.guest,
		);
		const second = makeGuest();
		const secondPromise = controller.awaitSelection(
			"pane-1",
			"op-2",
			second.guest,
		);
		const firstResult = await firstPromise;
		expect(firstResult).toEqual({
			opId: "op-1",
			kind: "cancelled",
			reason: "user",
		});
		// Replacement must not inject teardown into the guest (skipTeardown).
		expect(
			first.injected.filter((s) => s.includes(TEARDOWN_MARKER)),
		).toHaveLength(0);
		second.resolveClick(validRawPayload());
		const secondResult = await secondPromise;
		expect(secondResult.kind).toBe("selected");
		first.resolveClick({ __supersetDesignCancelled: true });
	});

	test("guest destruction cancels with reason destroyed", async () => {
		const controller = new DesignModeController();
		const { guest, emit, resolveClick } = makeGuest();
		const resultPromise = controller.awaitSelection("pane-1", "op-1", guest);
		emit("destroyed");
		const result = await resultPromise;
		expect(result).toEqual({
			opId: "op-1",
			kind: "cancelled",
			reason: "destroyed",
		});
		resolveClick({ __supersetDesignCancelled: true });
	});
});
