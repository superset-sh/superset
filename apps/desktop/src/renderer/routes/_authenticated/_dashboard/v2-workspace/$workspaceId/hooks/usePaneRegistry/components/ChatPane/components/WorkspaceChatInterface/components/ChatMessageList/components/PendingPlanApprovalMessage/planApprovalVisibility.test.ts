import { describe, expect, it } from "bun:test";
import {
	createPlanApprovalVisibilityState,
	isPlanApprovalVisible,
	planApprovalChanged,
	planResponded,
} from "./planApprovalVisibility";

describe("planApprovalVisibility", () => {
	it("shows a freshly received plan", () => {
		let state = createPlanApprovalVisibilityState();
		state = planApprovalChanged(state, "plan-1");
		expect(isPlanApprovalVisible(state, "plan-1")).toBe(true);
	});

	it("hides a plan the user has responded to", () => {
		let state = createPlanApprovalVisibilityState();
		state = planApprovalChanged(state, "plan-1");
		state = planResponded(state, "plan-1");
		expect(isPlanApprovalVisible(state, "plan-1")).toBe(false);
	});

	// Reproduces #5162: "When you request a change to a plan, it flash-hides the
	// plan while it's re-working it, but then re-shows the old plan, and then
	// stealth updates it."
	it("keeps a responded plan hidden when the snapshot drops and re-adds it", () => {
		let state = createPlanApprovalVisibilityState();

		// 1. Plan arrives and is shown.
		state = planApprovalChanged(state, "plan-1");
		expect(isPlanApprovalVisible(state, "plan-1")).toBe(true);

		// 2. User clicks "Request changes" -> optimistic hide (flash-hide).
		state = planResponded(state, "plan-1");
		expect(isPlanApprovalVisible(state, "plan-1")).toBe(false);

		// 3. While the agent reworks, the polling snapshot briefly drops the
		//    pending plan...
		state = planApprovalChanged(state, null);

		// 4. ...and then momentarily re-emits the SAME old plan before the
		//    revised one is ready.
		state = planApprovalChanged(state, "plan-1");

		// The old, already-handled plan must stay hidden — no flicker.
		expect(isPlanApprovalVisible(state, "plan-1")).toBe(false);
	});

	it("shows the revised plan once a new planId arrives", () => {
		let state = createPlanApprovalVisibilityState();
		state = planApprovalChanged(state, "plan-1");
		state = planResponded(state, "plan-1");
		state = planApprovalChanged(state, null);
		state = planApprovalChanged(state, "plan-2");
		expect(isPlanApprovalVisible(state, "plan-2")).toBe(true);
	});
});
