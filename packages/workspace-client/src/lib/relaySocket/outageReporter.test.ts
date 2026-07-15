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

	it("attaches the outage's last observed close info when the threshold-crossing call has none", () => {
		collect();
		const reporter = createOutageReporter("bus");
		reporter.attempt("ws://relay/hosts/h/events", null);
		// Dial failures surface as close (with code) and error (without) pairs;
		// the error side can be the one that crosses the threshold.
		reporter.failed(4, { code: 1006, reason: "abnormal" });
		reporter.failed(5);
		expect(telemetry).toHaveLength(1);
		expect(telemetry[0]).toMatchObject({
			kind: "degraded",
			closeCode: 1006,
			closeReason: "abnormal",
		});

		// The stashed close info doesn't leak into the next outage.
		reporter.opened(6);
		for (let i = 1; i <= 6; i++) {
			reporter.failed(i);
		}
		const second = telemetry.filter((e) => e.kind === "degraded")[1];
		expect(second?.closeCode).toBeNull();
	});

	it("never lets a throwing sink escape into the caller", () => {
		setRelaySocketTelemetry(() => {
			throw new Error("analytics exploded");
		});
		const reporter = createOutageReporter("bus");
		reporter.attempt("ws://relay/hosts/h/events", {
			status: 403,
			region: null,
		});
		expect(() => reporter.accessDenied(1)).not.toThrow();
		expect(() => reporter.failed(6)).not.toThrow();
		expect(() => reporter.opened(7)).not.toThrow();
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
