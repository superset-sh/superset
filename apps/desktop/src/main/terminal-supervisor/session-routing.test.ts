import { describe, expect, it } from "bun:test";
import { SupervisorSessionRouting } from "./session-routing";

describe("SupervisorSessionRouting", () => {
	it("keeps a session attached to the worker until the last app client detaches", () => {
		const routing = new SupervisorSessionRouting();

		routing.attachSession({
			sessionId: "session-1",
			workerId: "primary",
			clientId: "client-a",
		});
		routing.attachSession({
			sessionId: "session-1",
			workerId: "primary",
			clientId: "client-b",
		});

		expect(routing.getAttachedClientIds("session-1")).toEqual([
			"client-a",
			"client-b",
		]);

		expect(
			routing.detachSession({
				sessionId: "session-1",
				clientId: "client-a",
			}),
		).toEqual({
			sessionId: "session-1",
			workerId: "primary",
			shouldDetachWorker: false,
			wasExited: false,
		});

		expect(routing.getAttachedClientIds("session-1")).toEqual(["client-b"]);

		expect(
			routing.detachSession({
				sessionId: "session-1",
				clientId: "client-b",
			}),
		).toEqual({
			sessionId: "session-1",
			workerId: "primary",
			shouldDetachWorker: true,
			wasExited: false,
		});
	});

	it("drops exited sessions once the final app attachment is gone", () => {
		const routing = new SupervisorSessionRouting();

		routing.attachSession({
			sessionId: "session-2",
			workerId: "primary",
			clientId: "client-a",
		});
		routing.markSessionExited("session-2");

		expect(
			routing.detachSession({
				sessionId: "session-2",
				clientId: "client-a",
			}),
		).toEqual({
			sessionId: "session-2",
			workerId: "primary",
			shouldDetachWorker: true,
			wasExited: true,
		});
		expect(routing.getAttachedClientIds("session-2")).toEqual([]);
	});

	it("does not keep drained workers alive for sessions that already exited", () => {
		const routing = new SupervisorSessionRouting();

		routing.attachSession({
			sessionId: "session-exited",
			workerId: "draining-worker",
			clientId: "client-a",
		});

		expect(routing.hasRoutedSessions("draining-worker")).toBe(true);

		routing.markSessionExited("session-exited");

		expect(routing.hasRoutedSessions("draining-worker")).toBe(false);
	});

	it("detaches all sessions for a disconnected client", () => {
		const routing = new SupervisorSessionRouting();

		routing.attachSession({
			sessionId: "session-a",
			workerId: "primary",
			clientId: "client-a",
		});
		routing.attachSession({
			sessionId: "session-b",
			workerId: "primary",
			clientId: "client-a",
		});
		routing.attachSession({
			sessionId: "session-b",
			workerId: "primary",
			clientId: "client-b",
		});

		expect(routing.detachClient("client-a")).toEqual([
			{
				sessionId: "session-a",
				workerId: "primary",
				shouldDetachWorker: true,
				wasExited: false,
			},
			{
				sessionId: "session-b",
				workerId: "primary",
				shouldDetachWorker: false,
				wasExited: false,
			},
		]);
		expect(routing.getAttachedClientIds("session-b")).toEqual(["client-b"]);
	});

	it("restores detached live sessions for supervisor restart recovery", () => {
		const routing = new SupervisorSessionRouting();

		routing.restoreSession({
			sessionId: "session-restored",
			workerId: "worker-a",
		});

		expect(routing.getWorkerId("session-restored")).toBe("worker-a");
		expect(routing.getAttachedClientIds("session-restored")).toEqual([]);
		expect(routing.hasRoutedSessions("worker-a")).toBe(true);

		routing.markSessionExited("session-restored");

		expect(routing.hasRoutedSessions("worker-a")).toBe(false);
	});
});
