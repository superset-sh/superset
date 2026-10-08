import { describe, expect, test } from "bun:test";
import { sharedChatCreate, watchChatCreate } from "./sharedChatCreate";

function deferred() {
	let resolve: (sessionId: string) => void = () => {};
	const promise = new Promise<string>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("sharedChatCreate", () => {
	test("a remount joins the create already running", async () => {
		const pending = deferred();
		let creates = 0;
		const create = () => {
			creates += 1;
			return pending.promise;
		};
		const unwatch = watchChatCreate("pane-a");
		const first = sharedChatCreate("pane-a", create, () => {});
		const second = sharedChatCreate("pane-a", create, () => {});
		pending.resolve("session-1");

		expect(await first).toBe("session-1");
		expect(await second).toBe("session-1");
		expect(creates).toBe(1);
		unwatch();
	});

	test("closes a session whose pane went away before it started", async () => {
		const pending = deferred();
		const closed: string[] = [];
		const unwatch = watchChatCreate("pane-b");
		const created = sharedChatCreate(
			"pane-b",
			() => pending.promise,
			(sessionId) => closed.push(sessionId),
		);
		unwatch();
		pending.resolve("session-2");

		await created;
		expect(closed).toEqual(["session-2"]);
	});
});
