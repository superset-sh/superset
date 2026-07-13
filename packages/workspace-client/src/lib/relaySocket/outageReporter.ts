import type { RelayAffinityProbe } from "../primeRelayAffinity";

export interface RelaySocketTelemetryEvent {
	kind: "access_denied" | "degraded" | "recovered";
	socketName: string;
	/** Attempt URL without its query string — the token never leaves this module. */
	endpoint: string | null;
	/** `_whoowns` preflight status; null when the probe failed (relay unreachable). */
	preflightStatus: number | null;
	tunnelRegion: string | null;
	closeCode: number | null;
	closeReason: string | null;
	/** Dial attempts in the current outage at emit time. */
	failedAttempts: number;
	/** Outage duration; only on `recovered`. */
	outageMs: number | null;
}

type RelaySocketTelemetrySink = (event: RelaySocketTelemetryEvent) => void;

let telemetrySink: RelaySocketTelemetrySink | null = null;

/**
 * Install a process-wide sink for socket-health events. Analytics wiring lives
 * in the consuming app so this package stays analytics-vendor-free. At most one
 * event per outage episode (plus one on recovery), so the sink can forward
 * without sampling.
 */
export function setRelaySocketTelemetry(
	sink: RelaySocketTelemetrySink | null,
): void {
	telemetrySink = sink;
}

// Below this many consecutive failed dials an outage is assumed transient
// (host restart, network blip) and not worth an event.
const DEGRADED_AFTER_ATTEMPTS = 5;

export interface CloseInfo {
	code: number;
	reason: string;
}

/**
 * Collapses a socket's connection churn into outage episodes: one
 * `access_denied` or `degraded` event when an episode is worth reporting, one
 * `recovered` when it ends. Pure policy — callers feed it dial outcomes.
 */
export function createOutageReporter(socketName: string) {
	let probe: RelayAffinityProbe | null = null;
	let endpoint: string | null = null;
	let outageStartedAt: number | null = null;
	// Failed dials surface as error and close events in either order, and only
	// the close carries a code — keep the outage's last observed one so the
	// threshold-crossing call doesn't have to be the one that saw it.
	let lastClose: CloseInfo | null = null;
	// One telemetry event per outage episode; cleared on the next open.
	let reported = false;

	const emit = (
		kind: RelaySocketTelemetryEvent["kind"],
		failedAttempts: number,
		close: CloseInfo | null,
	): void => {
		try {
			telemetrySink?.({
				kind,
				socketName,
				endpoint,
				preflightStatus: probe?.status ?? null,
				tunnelRegion: probe?.region ?? null,
				closeCode: close?.code ?? null,
				closeReason: close?.reason || null,
				failedAttempts,
				outageMs:
					kind === "recovered" && outageStartedAt !== null
						? Date.now() - outageStartedAt
						: null,
			});
		} catch {
			// A throwing sink must never break the socket lifecycle.
		}
	};

	return {
		/** A dial is starting: remember its target and preflight result. */
		attempt(signedUrl: string, attemptProbe: RelayAffinityProbe | null): void {
			endpoint = signedUrl.split("?")[0] ?? null;
			probe = attemptProbe;
		},

		/** The preflight returned a definitive 403. */
		accessDenied(failedAttempts: number): void {
			outageStartedAt ??= Date.now();
			if (reported) return;
			reported = true;
			emit("access_denied", failedAttempts, null);
		},

		/** A dial failed or an established connection dropped. */
		failed(failedAttempts: number, close?: CloseInfo): void {
			outageStartedAt ??= Date.now();
			if (close) lastClose = close;
			if (reported || failedAttempts < DEGRADED_AFTER_ATTEMPTS) return;
			reported = true;
			emit("degraded", failedAttempts, lastClose);
		},

		/** The socket (re)connected; closes out a reported episode. */
		opened(failedAttempts: number): void {
			if (reported) emit("recovered", failedAttempts, null);
			outageStartedAt = null;
			lastClose = null;
			reported = false;
		},
	};
}
