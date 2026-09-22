import {
	afterEach,
	beforeEach,
	expect,
	jest,
	mock,
	spyOn,
	test,
} from "bun:test";
import { TunnelClient } from "./tunnel-client";

class FakeSocket extends EventTarget {
	static instances: FakeSocket[] = [];
	static OPEN = 1;
	static CONNECTING = 0;
	readyState = 0;
	binaryType = "blob";
	close = mock(() => {
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	});

	constructor(readonly url: string) {
		super();
		FakeSocket.instances.push(this);
	}

	static at(index: number) {
		const socket = FakeSocket.instances[index];
		if (!socket) throw new Error(`Missing socket ${index}`);
		return socket;
	}

	open() {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}
}

const originalWebSocket = globalThis.WebSocket;
let elapsed = 0;

beforeEach(() => {
	jest.useFakeTimers();
	elapsed = 0;
	spyOn(performance, "now").mockImplementation(() => elapsed);
	FakeSocket.instances = [];
	globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
});

afterEach(() => {
	globalThis.WebSocket = originalWebSocket;
	mock.restore();
	jest.useRealTimers();
});

function advance(ms: number) {
	elapsed += ms;
	jest.advanceTimersByTime(ms);
}

function startDial() {
	const client = new TunnelClient({
		relayUrl: "https://relay.example",
		hostId: "org:host",
		getAuthToken: async () => null,
		localPort: 1234,
		hostServiceSecret: "test",
	});
	const attach = mock(() => {});
	const failed = spyOn(
		client as unknown as { reportDialFailed(ticket: string): void },
		"reportDialFailed",
	).mockImplementation(() => {});
	// biome-ignore lint/complexity/useLiteralKeys: Bracket access permits testing the private dial without a control connection.
	client["dialRelay"]("ticket", attach);
	return { attach, failed };
}

test("a slow dial opens after the old timeout without being restarted", () => {
	const { attach, failed } = startDial();
	advance(25_000);
	expect(FakeSocket.instances).toHaveLength(1);
	expect(FakeSocket.at(0).close).not.toHaveBeenCalled();
	FakeSocket.at(0).open();
	advance(60_000);
	expect(attach).toHaveBeenCalledTimes(1);
	expect(failed).not.toHaveBeenCalled();
});

test("an explicit failure retries within the original total budget", () => {
	const { attach, failed } = startDial();
	advance(20_000);
	FakeSocket.at(0).close();
	expect(FakeSocket.instances).toHaveLength(2);
	advance(9_999);
	expect(failed).not.toHaveBeenCalled();
	advance(1);
	expect(failed).toHaveBeenCalledTimes(1);
	expect(FakeSocket.at(1).close).toHaveBeenCalledTimes(1);
	FakeSocket.at(1).open();
	expect(attach).not.toHaveBeenCalled();
});

test("a stalled dial stops at 30 seconds without starting a doomed retry", () => {
	const { failed } = startDial();
	advance(30_000);
	expect(failed).toHaveBeenCalledTimes(1);
	expect(FakeSocket.instances).toHaveLength(1);
	expect(FakeSocket.at(0).close).toHaveBeenCalledTimes(1);
});

test("an opened ticket is never retried when its stream closes", () => {
	const { attach, failed } = startDial();
	FakeSocket.at(0).open();
	FakeSocket.at(0).close();
	advance(60_000);
	expect(FakeSocket.instances).toHaveLength(1);
	expect(attach).toHaveBeenCalledTimes(1);
	expect(failed).not.toHaveBeenCalled();
});

test("a successful second attempt cancels the shared deadline", () => {
	const { attach, failed } = startDial();
	advance(10_000);
	FakeSocket.at(0).close();
	advance(19_999);
	FakeSocket.at(1).open();
	advance(60_000);
	expect(attach).toHaveBeenCalledTimes(1);
	expect(failed).not.toHaveBeenCalled();
	expect(FakeSocket.at(1).close).not.toHaveBeenCalled();
});

test("two explicit failures stop without a third attempt", () => {
	const { attach, failed } = startDial();
	FakeSocket.at(0).close();
	FakeSocket.at(1).close();
	advance(60_000);
	expect(FakeSocket.instances).toHaveLength(2);
	expect(failed).toHaveBeenCalledTimes(1);
	expect(attach).not.toHaveBeenCalled();
});

test("wall-clock changes cannot extend the dial budget", () => {
	const { failed } = startDial();
	advance(20_000);
	spyOn(Date, "now").mockReturnValue(-1_000_000);
	FakeSocket.at(0).close();
	advance(10_000);
	expect(failed).toHaveBeenCalledTimes(1);
	expect(FakeSocket.instances).toHaveLength(2);
});

test("timer rounding cannot start a retry with a fractional budget", () => {
	const { failed } = startDial();
	elapsed = 29_999.5;
	jest.advanceTimersByTime(30_000);
	expect(failed).toHaveBeenCalledTimes(1);
	expect(FakeSocket.instances).toHaveLength(1);
});
