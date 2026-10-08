import { describe, expect, test } from "bun:test";
import {
	agentEventHref,
	agentEventTarget,
	isViewingWorkspace,
} from "./agentEventTarget";

describe("agentEventTarget", () => {
	test("opens the session a notification is about", () => {
		const target = agentEventTarget({
			event: "stop",
			workspaceId: "w1",
			terminalId: "t1",
		});

		expect(target && agentEventHref(target)).toBe(
			"/(authenticated)/workspace/w1?tab=t1",
		);
		expect(target && isViewingWorkspace("/workspace/w1", target)).toBe(true);
	});

	test("ignores a payload without both ids", () => {
		expect(agentEventTarget({ workspaceId: "w1" })).toBeNull();
		expect(agentEventTarget(null)).toBeNull();
	});
});
