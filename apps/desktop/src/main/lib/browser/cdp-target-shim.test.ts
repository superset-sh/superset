import { describe, expect, it } from "bun:test";
import {
	forwardSessionFor,
	handleTargetCommand,
	shimIds,
	type TargetCommandContext,
	tagEventSession,
} from "./cdp-target-shim";

const ids = shimIds("paneA");

function ctx(over: Partial<TargetCommandContext> = {}): TargetCommandContext {
	return {
		ids,
		url: "http://127.0.0.1:8755/",
		title: "Demo",
		flatSessionId: null,
		autoAttachEmitted: false,
		...over,
	};
}

describe("cdp-target-shim", () => {
	it("derives stable synthetic ids from the pane id", () => {
		expect(shimIds("p1")).toEqual({
			targetId: "pane-p1",
			sessionId: "pane-session-p1",
			browserContextId: "pane-context-p1",
		});
	});

	it("returns null for non-Target methods so the caller forwards them", () => {
		expect(handleTargetCommand("Runtime.evaluate", {}, ctx())).toBeNull();
		expect(handleTargetCommand("Page.navigate", {}, ctx())).toBeNull();
	});

	it("presents the pane as one page target", () => {
		const res = handleTargetCommand("Target.getTargets", {}, ctx());
		expect(res?.result).toEqual({
			targetInfos: [
				{
					targetId: "pane-paneA",
					type: "page",
					title: "Demo",
					url: "http://127.0.0.1:8755/",
					attached: false,
					canAccessOpener: false,
					browserContextId: "pane-context-paneA",
				},
			],
		});
	});

	it("attaches by handing back the synthetic flatten session", () => {
		const res = handleTargetCommand(
			"Target.attachToTarget",
			{ targetId: "pane-paneA", flatten: true },
			ctx(),
		);
		expect(res?.result).toEqual({ sessionId: "pane-session-paneA" });
		expect(res?.flatSessionId).toBe("pane-session-paneA");
	});

	it("reuses the pane for createTarget (a single pane can't spawn tabs)", () => {
		const res = handleTargetCommand(
			"Target.createTarget",
			{ url: "about:blank" },
			ctx(),
		);
		expect(res?.result).toEqual({ targetId: "pane-paneA" });
		expect(res?.flatSessionId).toBe("pane-session-paneA");
		// about:blank / empty carry no navigation.
		expect(res?.navigateTo).toBeUndefined();
	});

	it("navigates the reused pane when createTarget names a real url", () => {
		const res = handleTargetCommand(
			"Target.createTarget",
			{ url: "https://example.com/" },
			ctx(),
		);
		expect(res?.result).toEqual({ targetId: "pane-paneA" });
		expect(res?.navigateTo).toBe("https://example.com/");
	});

	it("synthesizes attachedToTarget on setAutoAttach, once", () => {
		const res = handleTargetCommand(
			"Target.setAutoAttach",
			{ autoAttach: true, flatten: true },
			ctx(),
		);
		expect(res?.result).toEqual({});
		expect(res?.autoAttachEmitted).toBe(true);
		expect(res?.events).toHaveLength(1);
		expect(res?.events[0]).toMatchObject({
			method: "Target.attachedToTarget",
			params: {
				sessionId: "pane-session-paneA",
				targetInfo: { targetId: "pane-paneA", type: "page" },
				waitingForDebugger: false,
			},
		});

		// Already emitted -> no duplicate event.
		const again = handleTargetCommand(
			"Target.setAutoAttach",
			{ autoAttach: true },
			ctx({ flatSessionId: ids.sessionId, autoAttachEmitted: true }),
		);
		expect(again?.events).toHaveLength(0);
	});

	it("emits detachedFromTarget and clears the session on detachFromTarget", () => {
		const res = handleTargetCommand(
			"Target.detachFromTarget",
			{ sessionId: ids.sessionId },
			ctx({ flatSessionId: ids.sessionId, autoAttachEmitted: true }),
		);
		expect(res?.result).toEqual({});
		expect(res?.flatSessionId).toBeNull();
		expect(res?.events).toEqual([
			{
				method: "Target.detachedFromTarget",
				params: { sessionId: "pane-session-paneA", targetId: "pane-paneA" },
			},
		]);
	});

	it("detaches related sessions when auto-attach is disabled", () => {
		const res = handleTargetCommand(
			"Target.setAutoAttach",
			{ autoAttach: false },
			ctx({ flatSessionId: ids.sessionId, autoAttachEmitted: true }),
		);
		expect(res?.flatSessionId).toBeNull();
		expect(res?.events[0]).toMatchObject({
			method: "Target.detachedFromTarget",
			params: { sessionId: "pane-session-paneA" },
		});
	});

	it("acknowledges closeTarget without signalling a real close", () => {
		const res = handleTargetCommand(
			"Target.closeTarget",
			{ targetId: "pane-paneA" },
			ctx({ flatSessionId: ids.sessionId }),
		);
		expect(res?.result).toEqual({ success: true });
	});

	it("acks unknown Target.* commands with an empty result", () => {
		expect(
			handleTargetCommand("Target.activateTarget", {}, ctx())?.result,
		).toEqual({});
		expect(
			handleTargetCommand("Target.setDiscoverTargets", {}, ctx())?.result,
		).toEqual({});
	});

	it("marks the target attached once a flatten session is held", () => {
		const res = handleTargetCommand(
			"Target.getTargetInfo",
			{},
			ctx({ flatSessionId: ids.sessionId }),
		);
		expect(res?.result).toMatchObject({ targetInfo: { attached: true } });
	});

	it("strips the synthetic session when forwarding, passes others through", () => {
		expect(forwardSessionFor("pane-session-paneA", "pane-session-paneA")).toBe(
			undefined,
		);
		expect(forwardSessionFor("child-42", "pane-session-paneA")).toBe(
			"child-42",
		);
		expect(forwardSessionFor(undefined, "pane-session-paneA")).toBe(undefined);
	});

	it("tags root events with the flatten session once attached", () => {
		expect(tagEventSession(undefined, "pane-session-paneA")).toBe(
			"pane-session-paneA",
		);
		expect(tagEventSession(undefined, null)).toBe(undefined);
		expect(tagEventSession("child-42", "pane-session-paneA")).toBe("child-42");
	});
});
