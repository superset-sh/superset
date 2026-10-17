import { expect, test } from "bun:test";
import { waitForWorkspaceRunStop } from "./waitForWorkspaceRunStop";

test("waits for a Ctrl+C target to return to its shell", async () => {
	const states = [true, false];
	expect(
		await waitForWorkspaceRunStop(async () => states.shift() ?? false),
	).toBe(true);
});

test("leaves the run active when its state cannot be checked", async () => {
	expect(
		await waitForWorkspaceRunStop(async () => {
			throw new Error("offline");
		}),
	).toBe(false);
});

test("leaves the run active when the process ignores Ctrl+C", async () => {
	let checks = 0;
	expect(
		await waitForWorkspaceRunStop(async () => {
			checks++;
			return true;
		}),
	).toBe(false);
	expect(checks).toBe(8);
});
