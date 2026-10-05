import * as net from "node:net";
import {
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
	type ServerMessage,
} from "@superset/pty-daemon/protocol";

export interface DaemonProbeResult {
	daemonVersion: string;
	daemonPid?: number;
	trustdHealthy?: boolean;
}

/**
 * How a failed probe attempt failed, for the retry wrapper's stop decision.
 * `connected` = the connect succeeded (a silent listener holds the path).
 * `noListener` = the connect was definitively refused (ECONNREFUSED/ENOENT).
 * Neither set = indeterminate — most notably a timeout with the connect still
 * pending, which is how a flooded listener with a full accept backlog looks.
 */
export interface ProbeAttemptOutcome {
	connected?: boolean;
	noListener?: boolean;
}

export function probeDaemonHello(
	socketPath: string,
	timeoutMs: number,
	outcome?: ProbeAttemptOutcome,
): Promise<DaemonProbeResult | null> {
	return new Promise<DaemonProbeResult | null>((resolve) => {
		const sock = net.createConnection({ path: socketPath });
		const decoder = new FrameDecoder();
		let settled = false;

		const cleanup = (value: DaemonProbeResult | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			sock.removeAllListeners();
			try {
				sock.end();
			} catch {
				// best-effort
			}
			try {
				sock.destroy();
			} catch {
				// best-effort
			}
			resolve(value);
		};

		const timer = setTimeout(() => cleanup(null), timeoutMs);

		sock.once("error", (err: NodeJS.ErrnoException) => {
			if (
				outcome &&
				!outcome.connected &&
				(err.code === "ECONNREFUSED" || err.code === "ENOENT")
			) {
				outcome.noListener = true;
			}
			cleanup(null);
		});
		sock.once("close", () => cleanup(null));

		sock.once("connect", () => {
			if (outcome) outcome.connected = true;
			try {
				sock.write(
					encodeFrame({
						type: "hello",
						protocols: [CURRENT_PROTOCOL_VERSION],
						clientVersion: "supervisor-probe",
					}),
				);
			} catch {
				cleanup(null);
			}
		});

		sock.on("data", (chunk: Buffer) => {
			try {
				decoder.push(chunk);
				for (const decoded of decoder.drain()) {
					const msg = decoded.message as ServerMessage;
					if (msg.type === "hello-ack") {
						const daemonVersion = msg.daemonVersion;
						if (!daemonVersion) {
							cleanup(null);
							return;
						}
						cleanup({
							daemonVersion,
							daemonPid: msg.daemonPid,
							trustdHealthy: msg.trustdHealthy,
						});
						return;
					}
					cleanup(null);
					return;
				}
			} catch {
				cleanup(null);
			}
		});
	});
}
