// E2E acceptance instrument for the relay. Spins up a fake local
// host-service (echo WS + JSON HTTP), connects the REAL TunnelClient to the
// relay under test, then probes through the client-facing routes exactly as
// desktop/web would. Exits non-zero on any failure.
//
//   SUPERSET_API_KEY=sk_live_… bun apps/relay/scripts/e2e-probe.ts \
//     [--relay http://localhost:8787] [--host-id <orgId>:<machineId>]

import { TunnelClient } from "../../../packages/host-service/src/tunnel/tunnel-client";

const API_URL = "https://api.superset.sh";
const relayArg = process.argv.indexOf("--relay");
const RELAY =
	relayArg > -1 ? (process.argv[relayArg + 1] ?? "") : "http://localhost:8787";
const hostIdArg = process.argv.indexOf("--host-id");
const HOST_ID =
	hostIdArg > -1
		? (process.argv[hostIdArg + 1] ?? "")
		: "a1b2c3d4-e5f6-7890-abcd-ef1234567890:a5b47dedad57a63d234ffff6753c74df";

const API_KEY = process.env.SUPERSET_API_KEY;
if (!API_KEY) {
	console.error("SUPERSET_API_KEY required");
	process.exit(1);
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
	console.log(
		`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
	);
	if (!ok) failures++;
}

async function mintJwt(): Promise<string> {
	const res = await fetch(`${API_URL}/api/auth/token`, {
		headers: { "x-api-key": API_KEY ?? "" },
	});
	if (!res.ok) throw new Error(`JWT mint failed: ${res.status}`);
	return ((await res.json()) as { token: string }).token;
}

// ── Fake local host-service ─────────────────────────────────────────

const local = Bun.serve({
	port: 0,
	fetch(req, server) {
		const url = new URL(req.url);
		if (server.upgrade(req)) return;
		return Response.json({
			echo: true,
			method: req.method,
			path: url.pathname,
			auth: req.headers.get("authorization")?.slice(0, 12) ?? null,
		});
	},
	websocket: {
		message(ws, message) {
			ws.send(message);
		},
	},
});
console.log(`[probe] fake local service on :${local.port}`);

// ── Host side: real TunnelClient ──────────────────────────────────

const tunnel = new TunnelClient({
	relayUrl: RELAY,
	hostId: HOST_ID,
	getAuthToken: mintJwt,
	localPort: local.port,
	hostServiceSecret: "probe-secret",
});
await tunnel.connect();
await new Promise((r) => setTimeout(r, 2_500));

// ── Client side probes ──────────────────────────────────────────────

const jwt = await mintJwt();
const wsBase = RELAY.replace(/^http/, "ws");

// 1. _whoowns sees the tunnel
{
	const res = await fetch(
		`${RELAY}/hosts/${HOST_ID}/_whoowns?token=${encodeURIComponent(jwt)}`,
	);
	check("_whoowns 200", res.status === 200, `status=${res.status}`);
}

// 1b. /presence reports the host online with a fresh lastSeenAt
{
	const res = await fetch(
		`${RELAY}/presence?hostIds=${encodeURIComponent(HOST_ID)},bogus-org:bogus-machine&token=${encodeURIComponent(jwt)}`,
	);
	const body = (await res.json()) as {
		hosts: Record<string, { online: boolean; lastSeenAt: number | null }>;
	};
	const info = body.hosts[HOST_ID];
	check("presence 200", res.status === 200, `status=${res.status}`);
	check("presence online", info?.online === true, JSON.stringify(info));
	check(
		"presence lastSeenAt fresh",
		typeof info?.lastSeenAt === "number" &&
			Date.now() - info.lastSeenAt < 60_000,
		JSON.stringify(info),
	);
	check(
		"presence omits denied host",
		!("bogus-org:bogus-machine" in body.hosts),
		JSON.stringify(Object.keys(body.hosts)),
	);
}

// 2. WS stream: echo round-trips, text + binary, with RTT stats
{
	const ws = new WebSocket(
		`${wsBase}/hosts/${HOST_ID}/echo?token=${encodeURIComponent(jwt)}`,
	);
	ws.binaryType = "arraybuffer";
	const opened = await new Promise<boolean>((resolve) => {
		const t = setTimeout(() => resolve(false), 15_000);
		ws.onopen = () => {
			clearTimeout(t);
			resolve(true);
		};
		ws.onerror = () => resolve(false);
	});
	check("client WS opens", opened);

	if (opened) {
		const rtts: number[] = [];
		for (let i = 0; i < 10; i++) {
			const sent = Date.now();
			const got = await new Promise<string | null>((resolve) => {
				const t = setTimeout(() => resolve(null), 10_000);
				ws.onmessage = (e) => {
					clearTimeout(t);
					resolve(String(e.data));
				};
				ws.send(`ping-${i}`);
			});
			if (got !== `ping-${i}`) {
				check(`echo ${i}`, false, `got ${got}`);
				break;
			}
			rtts.push(Date.now() - sent);
		}
		if (rtts.length === 10) {
			rtts.sort((a, b) => a - b);
			check(
				"10 text echoes",
				true,
				`rtt min=${rtts[0]} median=${rtts[5]} max=${rtts[9]}ms`,
			);
		}

		// The control channel's keepalive payload must not be intercepted on a
		// spliced stream; a DO-wide auto-response would swallow it.
		const pingLiteral = '{"type":"ping"}';
		const pingBack = await new Promise<string | null>((resolve) => {
			const t = setTimeout(() => resolve(null), 8_000);
			ws.onmessage = (e) => {
				clearTimeout(t);
				resolve(String(e.data));
			};
			ws.send(pingLiteral);
		});
		check(
			"ping-shaped frame splices verbatim",
			pingBack === pingLiteral,
			`got ${pingBack}`,
		);

		const bin = new Uint8Array(64 * 1024);
		crypto.getRandomValues(bin);
		const binOk = await new Promise<boolean>((resolve) => {
			const t = setTimeout(() => resolve(false), 10_000);
			ws.onmessage = (e) => {
				clearTimeout(t);
				const data = e.data as ArrayBuffer;
				const back = new Uint8Array(data);
				resolve(
					back.byteLength === bin.byteLength &&
						back.every((b, i) => b === bin[i]),
				);
			};
			ws.send(bin);
		});
		check("64KB binary echo intact", binOk);
		ws.close(1000);
	}
}

// 3. HTTP proxy: request reaches local service with secret auth
{
	const res = await fetch(`${RELAY}/hosts/${HOST_ID}/trpc/probe.test`, {
		method: "POST",
		headers: { Authorization: `Bearer ${jwt}`, "content-type": "text/plain" },
		body: "hello",
	});
	const data = (await res.json().catch(() => null)) as {
		echo?: boolean;
		path?: string;
		auth?: string;
	} | null;
	check(
		"HTTP proxy round-trip",
		res.status === 200 &&
			data?.echo === true &&
			data.path === "/trpc/probe.test",
		`status=${res.status} path=${data?.path}`,
	);
	check(
		"HTTP proxy injects host secret",
		data?.auth === "Bearer probe",
		`auth=${data?.auth}`,
	);
}

// 3b. Unauthenticated dial with a bogus ticket must be refused
{
	const wsDial = new WebSocket(
		`${wsBase}/v2/dial?hostId=${HOST_ID}&ticket=not-a-real-ticket`,
	);
	const closed = await new Promise<number | null>((resolve) => {
		const t = setTimeout(() => resolve(null), 10_000);
		wsDial.onclose = (e) => {
			clearTimeout(t);
			resolve(e.code);
		};
		wsDial.onerror = () => {
			clearTimeout(t);
			resolve(-1);
		};
	});
	check(
		"bogus dial ticket refused",
		closed === 1008 || closed === -1,
		`close=${closed}`,
	);
}

// 4. Offline behavior: closing the tunnel → 503 within the liveness window
{
	tunnel.close();
	await new Promise((r) => setTimeout(r, 1_500));
	const res = await fetch(
		`${RELAY}/hosts/${HOST_ID}/_whoowns?token=${encodeURIComponent(jwt)}`,
	);
	check("_whoowns 503 after close", res.status === 503, `status=${res.status}`);

	const presence = await fetch(
		`${RELAY}/presence?hostIds=${encodeURIComponent(HOST_ID)}&token=${encodeURIComponent(jwt)}`,
	);
	const body = (await presence.json()) as {
		hosts: Record<string, { online: boolean }>;
	};
	check(
		"presence offline after close",
		body.hosts[HOST_ID]?.online === false,
		JSON.stringify(body.hosts[HOST_ID]),
	);
}

local.stop(true);
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
