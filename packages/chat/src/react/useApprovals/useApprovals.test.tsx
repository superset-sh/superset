import { describe, expect, test } from "bun:test";
import { approvalRequest, turn } from "@superset/chat-runtime/testing";
import type { SessionSnapshot } from "../../core";
import { emptySnapshot, reduceMany } from "../../core";
import type { DurableEvent } from "../../protocol/envelope";
import type { ApprovalRequest } from "../../protocol/items";
import { registerDom } from "../../testing/registerDom";
import { useApprovals } from "./useApprovals";

registerDom();
const { render } = await import("@testing-library/react");

function buildSnapshot(): SessionSnapshot {
	const envelope = (seq: number, event: DurableEvent) => ({
		v: 1 as const,
		sessionId: "session-1",
		cursor: { epoch: "e1", seq },
		ts: seq,
		event,
	});
	return reduceMany(emptySnapshot(), [
		envelope(1, { type: "turn", turn: turn("t1") }),
		envelope(2, {
			type: "item",
			item: approvalRequest("ap1"),
			turnId: "t1",
		}),
		envelope(3, {
			type: "item",
			item: approvalRequest("ap2", { status: "approved" }),
			turnId: "t1",
		}),
	]);
}

let results: ApprovalRequest[][] = [];

function Probe(props: { snapshot: SessionSnapshot }) {
	results.push(useApprovals(props.snapshot));
	return null;
}

describe("useApprovals", () => {
	test("returns only pending approvals and memoizes on snapshot identity", () => {
		results = [];
		const snapshot = buildSnapshot();
		const view = render(<Probe snapshot={snapshot} />);
		const first = results.at(-1);
		expect(first?.map((approval) => approval.id)).toEqual(["ap1"]);

		view.rerender(<Probe snapshot={snapshot} />);
		expect(results.at(-1)).toBe(first);
		view.unmount();
	});
});
