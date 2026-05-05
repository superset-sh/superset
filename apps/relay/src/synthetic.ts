import { captureSentryMessage } from "./sentry";

const CHECK_INTERVAL_MS = 60_000;
const PROBE_TIMEOUT_MS = 10_000;

export interface SyntheticOptions {
	relayUrl: string;
	jwt: string;
	region: string;
	machineId: string;
}

export function startSyntheticCheck(opts: SyntheticOptions): void {
	const hostId = `__synthetic_${opts.region}_${opts.machineId}`;
	const tick = () => {
		void runProbe({ ...opts, hostId }).catch(() => {});
	};
	// First probe at boot+5s so the server has fully started.
	setTimeout(tick, 5_000);
	setInterval(tick, CHECK_INTERVAL_MS);
}

async function runProbe(
	opts: SyntheticOptions & { hostId: string },
): Promise<void> {
	const startedAt = Date.now();
	const url = new URL("/tunnel", opts.relayUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("hostId", opts.hostId);
	url.searchParams.set("token", opts.jwt);

	let ok = false;
	let reason = "unknown";
	const ws = new WebSocket(url.toString());

	const result = await new Promise<{ ok: boolean; reason: string }>(
		(resolve) => {
			const timeout = setTimeout(() => {
				resolve({ ok: false, reason: "timeout" });
			}, PROBE_TIMEOUT_MS);

			ws.addEventListener("open", () => {
				clearTimeout(timeout);
				resolve({ ok: true, reason: "open" });
			});
			ws.addEventListener("error", () => {
				clearTimeout(timeout);
				resolve({ ok: false, reason: "ws-error" });
			});
			ws.addEventListener("close", (event) => {
				clearTimeout(timeout);
				resolve({
					ok: false,
					reason: `closed:${event.code}`,
				});
			});
		},
	);
	ok = result.ok;
	reason = result.reason;

	try {
		ws.close(1000, "synthetic check done");
	} catch {
		// ignore
	}

	const latencyMs = Date.now() - startedAt;
	const log = {
		at: new Date().toISOString(),
		level: ok ? "info" : "error",
		msg: "relay_synthetic_check",
		region: opts.region,
		machine_id: opts.machineId,
		ok,
		reason,
		latency_ms: latencyMs,
	};
	console.log(JSON.stringify(log));

	if (!ok) {
		captureSentryMessage("relay_synthetic_fail", "error", log);
	}
}
