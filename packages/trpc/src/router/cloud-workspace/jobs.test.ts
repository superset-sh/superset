import { afterEach, expect, mock, spyOn, test } from "bun:test";

const fixtureEnv = {
	QSTASH_TOKEN: "owned-cloud-token",
	NEXT_PUBLIC_API_URL: "http://localhost:4567",
};
mock.module("../../env", () => ({ env: fixtureEnv }));
const originalFlag = process.env.SELF_HOST_QUEUE,
	originalURL = process.env.SELF_HOST_QUEUE_URL,
	originalSecret = process.env.SELF_HOST_QUEUE_SECRET;
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const fn of cleanup.splice(0).reverse()) fn();
	for (const [name, value] of Object.entries({
		SELF_HOST_QUEUE: originalFlag,
		SELF_HOST_QUEUE_URL: originalURL,
		SELF_HOST_QUEUE_SECRET: originalSecret,
	})) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
test("native cloud-workspace jobs await durable publication instead of the localhost timer shortcut", async () => {
	process.env.SELF_HOST_QUEUE = "1";
	process.env.SELF_HOST_QUEUE_URL = "http://127.0.0.1:8789";
	process.env.SELF_HOST_QUEUE_SECRET =
		"owned-cloud-workspace-queue-secret-0123456789";
	const { publishCloudWorkspaceJob } = await import("./jobs");
	const requests: unknown[] = [];
	const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
		async (_input, init) => {
			requests.push(JSON.parse(String(init?.body)));
			return Response.json({ messageId: "stored" }, { status: 202 });
		},
	);
	cleanup.push(() => fetchMock.mockRestore());
	const timer = spyOn(globalThis, "setTimeout").mockImplementation(() => {
		throw Error("native job reached local timer");
	});
	cleanup.push(() => timer.mockRestore());
	const runLocally = mock(async () => {});
	await publishCloudWorkspaceJob({
		path: "/api/cloud-workspaces/provision",
		body: { workspaceId: "owned" },
		delaySeconds: 7,
		runLocally,
	});
	expect(requests).toEqual([
		{
			url: "http://localhost:4567/api/cloud-workspaces/provision",
			body: { workspaceId: "owned" },
			delay: 7,
			retries: 2,
		},
	]);
	expect(timer).not.toHaveBeenCalled();
	expect(runLocally).not.toHaveBeenCalled();
});
test("default cloud-workspace local mode retains its detached timer and delay", async () => {
	process.env.SELF_HOST_QUEUE = "0";
	const { publishCloudWorkspaceJob } = await import("./jobs");
	const original = setTimeout;
	let scheduled: (() => void) | undefined;
	const timers: ReturnType<typeof setTimeout>[] = [];
	const timer = spyOn(globalThis, "setTimeout").mockImplementation(
		(callback, _delay) => {
			scheduled = () => {
				if (typeof callback === "function") callback();
			};
			const handle = original(() => {}, 0);
			timers.push(handle);
			return handle;
		},
	);
	cleanup.push(() => {
		timer.mockRestore();
		for (const handle of timers) clearTimeout(handle);
	});
	const runLocally = mock(async () => {});
	await publishCloudWorkspaceJob({
		path: "/api/cloud-workspaces/reap",
		body: { owned: true },
		delaySeconds: 9,
		runLocally,
	});
	expect(timer.mock.calls[0]?.[1]).toBe(9000);
	expect(runLocally).not.toHaveBeenCalled();
	scheduled?.();
	expect(runLocally).toHaveBeenCalledWith({ owned: true });
});
