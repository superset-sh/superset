import { expect, test } from "bun:test";
import { reportableAgentLaunchError } from "./reportableAgentLaunchError";

test("a surviving workspace with a failed agent is the caller's to report", () => {
	expect(
		reportableAgentLaunchError({
			ok: false,
			workspaceId: "ws-1",
			error: "Agent launch failed: boom",
		}),
	).toBe("Agent launch failed: boom");
});

test("a create that produced no workspace is left to the failed-create row", () => {
	expect(
		reportableAgentLaunchError({
			ok: false,
			error: "Host service is not running",
		}),
	).toBeNull();
});

test("a successful create reports nothing", () => {
	expect(
		reportableAgentLaunchError({ ok: true, workspaceId: "ws-1" }),
	).toBeNull();
});
