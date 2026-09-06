import { describe, expect, it } from "bun:test";
import {
	type AttachSocket,
	type AttachTty,
	buildAttachHandshake,
	DETACH_BYTE,
	type DetachReason,
	TerminalAttachBridge,
} from "./terminal-attach";

function makeHarness() {
	const sent: string[] = [];
	const closedCalls: number[] = [];
	const written: Uint8Array[] = [];
	const detachReasons: DetachReason[] = [];
	const statusLines: string[] = [];

	const socket: AttachSocket = {
		send: (data) => sent.push(data),
		close: () => closedCalls.push(1),
	};
	const tty: AttachTty = {
		writeOutput: (bytes) => written.push(bytes),
	};

	const bridge = new TerminalAttachBridge(socket, tty, {
		onDetach: (reason) => detachReasons.push(reason),
		onStatus: (line) => statusLines.push(line),
	});

	return { bridge, sent, closedCalls, written, detachReasons, statusLines };
}

describe("TerminalAttachBridge", () => {
	it("wraps local keystrokes as input messages", () => {
		const { bridge, sent } = makeHarness();

		bridge.handleTtyInput("ls -la\r");

		expect(sent).toEqual([JSON.stringify({ type: "input", data: "ls -la\r" })]);
	});

	it("wraps a resize as a resize message", () => {
		const { bridge, sent } = makeHarness();

		bridge.handleTtyResize(120, 40);

		expect(sent).toEqual([
			JSON.stringify({ type: "resize", cols: 120, rows: 40 }),
		]);
	});

	it("writes binary output frames straight to the tty, untouched", () => {
		const { bridge, written } = makeHarness();
		const bytes = new Uint8Array([104, 105]); // "hi"

		bridge.handleSocketMessage(bytes.buffer);

		expect(written).toHaveLength(1);
		expect([...(written[0] as Uint8Array)]).toEqual([104, 105]);
	});

	it("ignores unparsable or unknown control messages instead of throwing", () => {
		const { bridge, detachReasons, statusLines } = makeHarness();

		bridge.handleSocketMessage("not json");
		bridge.handleSocketMessage(
			JSON.stringify({ type: "synced", epoch: "e", seq: 1 }),
		);

		expect(detachReasons).toEqual([]);
		expect(statusLines).toEqual([]);
	});

	it("surfaces a title control message as status, without detaching", () => {
		const { bridge, statusLines, detachReasons } = makeHarness();

		bridge.handleSocketMessage(JSON.stringify({ type: "title", title: "vim" }));

		expect(statusLines).toEqual(["title: vim"]);
		expect(detachReasons).toEqual([]);
	});

	it("detaches on a server exit message and closes the socket", () => {
		const { bridge, detachReasons, closedCalls } = makeHarness();

		bridge.handleSocketMessage(
			JSON.stringify({ type: "exit", exitCode: 0, signal: 0 }),
		);

		expect(detachReasons).toEqual([
			{ kind: "server-exit", exitCode: 0, signal: 0 },
		]);
		expect(closedCalls).toHaveLength(1);
	});

	it("detaches on a server error message", () => {
		const { bridge, detachReasons } = makeHarness();

		bridge.handleSocketMessage(
			JSON.stringify({ type: "error", message: "session gone" }),
		);

		expect(detachReasons).toEqual([
			{ kind: "server-error", message: "session gone" },
		]);
	});

	it("detaches on socket close", () => {
		const { bridge, detachReasons } = makeHarness();

		bridge.handleSocketClose(1006, "abnormal closure");

		expect(detachReasons).toEqual([
			{ kind: "socket-closed", code: 1006, reason: "abnormal closure" },
		]);
	});

	it("intercepts the detach byte instead of forwarding it, and stops forwarding after", () => {
		const { bridge, sent, detachReasons, closedCalls } = makeHarness();

		bridge.handleTtyInput(`${DETACH_BYTE}`);
		bridge.handleTtyInput("more input after detach");

		expect(sent).toEqual([]);
		expect(detachReasons).toEqual([{ kind: "user" }]);
		expect(closedCalls).toHaveLength(1);
	});

	it("forwards text before an inline detach byte, then detaches", () => {
		const { bridge, sent, detachReasons } = makeHarness();

		bridge.handleTtyInput(`echo hi${DETACH_BYTE}rest is dropped`);

		expect(sent).toEqual([JSON.stringify({ type: "input", data: "echo hi" })]);
		expect(detachReasons).toEqual([{ kind: "user" }]);
	});

	it("only reports detach once, even if multiple end signals arrive", () => {
		const { bridge, detachReasons, closedCalls } = makeHarness();

		bridge.handleSocketMessage(
			JSON.stringify({ type: "exit", exitCode: 0, signal: 0 }),
		);
		bridge.handleSocketClose(1000, "normal");
		bridge.handleTtyInput(DETACH_BYTE);

		expect(detachReasons).toHaveLength(1);
		expect(closedCalls).toHaveLength(1);
	});

	it("stops forwarding tty input and socket messages after detaching", () => {
		const { bridge, sent, written } = makeHarness();

		bridge.handleTtyInput(DETACH_BYTE);
		bridge.handleTtyInput("ignored");
		bridge.handleSocketMessage(new Uint8Array([1, 2, 3]).buffer);

		expect(sent).toEqual([]);
		expect(written).toEqual([]);
	});
});

describe("buildAttachHandshake", () => {
	it("sends focus, visible, and an initial resize in order", () => {
		expect(buildAttachHandshake(80, 24)).toEqual([
			JSON.stringify({ type: "focus", focused: true }),
			JSON.stringify({ type: "visible", visible: true }),
			JSON.stringify({ type: "resize", cols: 80, rows: 24 }),
		]);
	});
});
