import { afterEach, describe, expect, it } from "bun:test";
import {
	createOutageReporter,
	type RelaySocketTelemetryEvent,
	setRelaySocketTelemetry,
} from "./outageReporter";

let telemetry: RelaySocketTelemetryEvent[] = [];

function collect(): void {
	telemetry = [];
	setRelaySocketTelemetry((e) => telemetry.push(e));
}

afterEach(() => {
	setRelaySocketTelemetry(null);
	telemetry = [];
});

describe("createOutageReporter", () => {
	it("reports degraded once at the attempt threshold, then recovered", () => {
		collect();
		const reporter = createOutageReporter("bus");
		reporter.attempt("ws://relay/hosts/h/events?token=secret", {
			status: 200,
			region: "iad",
		});
		for (let i = 1; i <= 8; i++) {
			reporter.failed(i, { code: 1006, reason: "" });
		}
		expect(telemetry.map((e) => e.kind)).toEqual(["degraded"]);
		expect(telemetry[0]).toMatchObject({
			socketName: "bus",
			endpoint: "ws://relay/hosts/h/events",
			preflightStatus: 200,
			tunnelRegion: "iad",
			closeCode: 1006,
			failedAttempts: 5,
		});

		reporter.opened(9);
		expect(telemetry.map((e) => e.kind)).toEqual(["degraded", "recovered"]);
		expect(telemetry[1]?.outageMs).not.toBeNull();
	});

	it("stays silent for short blips and clean opens", () => {
		collect();
		const reporter = createOutageReporter("bus");
		reporter.attempt("ws://relay/hosts/h/events", null);
		reporter.failed(1);
		reporter.failed(2);
		reporter.opened(3);
		expect(telemetry).toEqual([]);
	});

	it("reports access_denied once per episode and suppresses degraded", () => {
		collect();
		const reporter = createOutageReporter("bus");
		reporter.attempt("ws://relay/hosts/h/events?token=secret", {
			status: 403,
			region: null,
		});
		for (let i = 1; i <= 10; i++) {
			reporter.accessDenied(i);
			reporter.failed(i); // partysocket error event after provider rejection
		}
		expect(telemetry.map((e) => e.kind)).toEqual(["access_denied"]);
		expect(telemetry[0]?.preflightStatus).toBe(403);
		expect(telemetry[0]?.endpoint).not.toContain("secret");

		// Regrant: a successful open ends the episode, next denial reports again.
		reporter.opened(11);
		reporter.accessDenied(1);
		expect(telemetry.map((e) => e.kind)).toEqual([
			"access_denied",
			"recovered",
			"access_denied",
		]);
	});
});
