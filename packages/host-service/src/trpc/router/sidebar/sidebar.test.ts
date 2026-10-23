import { afterAll, describe, expect, it } from "bun:test";
import type { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { sidebarRouter } from "./sidebar";

const SECRET = "bridge-secret";
let reply: { status: number; body: unknown } = { status: 200, body: {} };
const received: unknown[] = [];

const bridge = Bun.serve({
	port: 0,
	hostname: "127.0.0.1",
	async fetch(request) {
		if (request.headers.get("authorization") !== `Bearer ${SECRET}`) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}
		received.push({
			path: new URL(request.url).pathname,
			body: await request.json(),
		});
		return Response.json(reply.body, { status: reply.status });
	},
});
afterAll(() => bridge.stop(true));

const callerFor = (context: Partial<HostServiceContext>) =>
	sidebarRouter.createCaller({
		isAuthenticated: true,
		organizationId: "org-host",
		isLocalCaller: true,
		browserBridge: { url: `http://127.0.0.1:${bridge.port}`, secret: SECRET },
		...context,
	} as HostServiceContext);

const errorOf = (promise: Promise<unknown>) =>
	promise.catch((thrown: unknown) => thrown) as Promise<TRPCError>;

describe("sidebar.pruneEmptyFolders", () => {
	it("asks the desktop for this host's organization", async () => {
		const result = {
			dryRun: true,
			removed: [
				{ projectId: "p1", projectName: "web", tag: "old", name: "Old" },
			],
			skipped: [],
			failed: [],
		};
		reply = { status: 200, body: result };
		received.length = 0;
		expect(
			await callerFor({}).pruneEmptyFolders({ projectId: "p1", dryRun: true }),
		).toEqual(result);
		expect(received).toEqual([
			{
				path: "/sidebar/prune-empty-folders",
				body: { organizationId: "org-host", projectId: "p1", dryRun: true },
			},
		]);
	});

	it.each([
		["through the relay", false],
		["of unknown origin", undefined],
	])("refuses a caller %s", async (_name, isLocalCaller) => {
		const error = await errorOf(
			callerFor({ isLocalCaller }).pruneEmptyFolders({}),
		);
		expect(error.code).toBe("FORBIDDEN");
	});

	it("needs a desktop app attached to the host", async () => {
		const error = await errorOf(
			callerFor({ browserBridge: undefined }).pruneEmptyFolders({}),
		);
		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.message).toContain("no desktop app is attached");
	});

	it("names an old desktop app instead of a bare 404", async () => {
		reply = { status: 404, body: {} };
		const error = await errorOf(callerFor({}).pruneEmptyFolders({}));
		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.message).toContain("too old");
	});

	it("passes on why no window could serve the request", async () => {
		reply = {
			status: 412,
			body: { error: "No desktop window is signed in to this organization." },
		};
		const error = await errorOf(callerFor({}).pruneEmptyFolders({}));
		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.message).toBe(
			"No desktop window is signed in to this organization.",
		);
	});
});
