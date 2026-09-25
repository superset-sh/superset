import { describe, expect, test } from "bun:test";
import type {
	CodexNotification,
	CodexServerRequest,
	CodexTransportHandlers,
} from "./rpcClient";
import { CodexRpcClient, CodexRpcError } from "./rpcClient";

type Harness = {
	client: CodexRpcClient;
	sent: Record<string, unknown>[];
	receive(frame: unknown): void;
	notifications: CodexNotification[];
	requests: CodexServerRequest[];
	exit(code: number | null): void;
};

function createHarness(): Harness {
	const sent: Record<string, unknown>[] = [];
	const notifications: CodexNotification[] = [];
	const requests: CodexServerRequest[] = [];
	let handlers: CodexTransportHandlers | null = null;

	const client = new CodexRpcClient({
		createTransport: (transportHandlers) => {
			handlers = transportHandlers;
			return {
				send: (line) => sent.push(JSON.parse(line)),
				close: async () => {},
			};
		},
		onNotification: (notification) => notifications.push(notification),
		onServerRequest: (request) => requests.push(request),
	});

	return {
		client,
		sent,
		notifications,
		requests,
		receive: (frame) => handlers?.onLine(JSON.stringify(frame)),
		exit: (code) => handlers?.onExit(code, null),
	};
}

describe("CodexRpcClient", () => {
	test("correlates responses to requests by id", async () => {
		const harness = createHarness();
		const pending = harness.client.request("thread/start", { cwd: "/tmp" });

		expect(harness.sent[0]).toEqual({
			jsonrpc: "2.0",
			id: 1,
			method: "thread/start",
			params: { cwd: "/tmp" },
		});

		harness.receive({ id: 1, result: { thread: { id: "t1" } } });
		expect(await pending).toEqual({ thread: { id: "t1" } });
	});

	test("rejects with the server error and keeps other requests pending", async () => {
		const harness = createHarness();
		const failing = harness.client.request("turn/interrupt");
		const other = harness.client.request("thread/start");

		harness.receive({
			id: 1,
			error: { code: -32602, message: "no such turn" },
		});

		await expect(failing).rejects.toBeInstanceOf(CodexRpcError);
		harness.receive({ id: 2, result: {} });
		expect(await other).toEqual({});
	});

	test("routes frames without an id to notifications and with one to requests", () => {
		const harness = createHarness();

		harness.receive({ method: "turn/started", params: { threadId: "t1" } });
		harness.receive({
			id: "srv-1",
			method: "item/fileChange/requestApproval",
			params: { itemId: "i1" },
		});

		expect(harness.notifications).toEqual([
			{ method: "turn/started", params: { threadId: "t1" } },
		]);
		expect(harness.requests).toEqual([
			{
				id: "srv-1",
				method: "item/fileChange/requestApproval",
				params: { itemId: "i1" },
			},
		]);
	});

	test("survives unparseable and unrecognized lines", () => {
		const harness = createHarness();
		harness.receive("not json at all");
		expect(() => harness.receive({ id: 1, result: {} })).not.toThrow();
		expect(harness.notifications).toEqual([]);
	});

	test("rejects in-flight requests when the process exits", async () => {
		const harness = createHarness();
		const pending = harness.client.request("turn/start");
		harness.exit(1);
		await expect(pending).rejects.toThrow(/exited/);
	});
});
