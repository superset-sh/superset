import { beforeAll, describe, expect, test } from "bun:test";
import { parseHostWsRoute } from "./ws-route";

// Repro for #5243: terminal WS through the relay closes 1011 "Failed to open
// channel" while tRPC over the same tunnel works. Root cause: routing keys are
// `<org>:<machineId>`; browsers encodeURIComponent the colon (`%3A`). Every
// HTTP path resolves the host via Hono's decoded `c.req.param("hostId")`, but
// the WS upgrade handler re-derived the host id straight from the raw pathname
// segment, which keeps `%3A` encoded — so `tunnels.get()` missed the tunnel
// registered under the decoded id and `openWsChannel` threw.

const ORG = "05edb58f-bb09-4f1b-932e-b8d7fc1115d9";
const MACHINE = "cb779d8b";
const ROUTING_KEY = `${ORG}:${MACHINE}`;
const WS_URL = `wss://relay.superset.sh/hosts/${encodeURIComponent(
	ROUTING_KEY,
)}/terminal/does-not-exist?token=jwt`;

type FakeWs = {
	readyState: number;
	send: (data: string | ArrayBuffer | Uint8Array<ArrayBuffer>) => void;
	close: (code?: number, reason?: string) => void;
};

// `./tunnel` pulls in `./env`, which validates the relay's runtime env at
// module load. Skip that for the unit test and load TunnelManager lazily.
let TunnelManager: typeof import("./tunnel").TunnelManager;
beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	({ TunnelManager } = await import("./tunnel"));
});

function injectTunnel(
	manager: InstanceType<typeof TunnelManager>,
	hostId: string,
	ws: FakeWs,
): void {
	// The host registers under the *decoded* routing key (Hono decodes the
	// `hostId` query param on /tunnel).
	(manager as unknown as { tunnels: Map<string, unknown> }).tunnels.set(
		hostId,
		{
			hostId,
			token: "tkn",
			ws,
			pendingRequests: new Map(),
			activeChannels: new Map(),
			pingTimer: null,
			missedPings: 0,
		},
	);
}

describe("relay WS host routing (#5243)", () => {
	test("documents the bug: raw pathname segment keeps the colon encoded", () => {
		// This is exactly what the old WS handler did to derive the host id.
		const rawSegment = new URL(WS_URL).pathname.split("/")[2];
		expect(rawSegment).toBe(`${ORG}%3A${MACHINE}`);
		// ...which does not match the tunnel key the host registered under.
		expect(rawSegment).not.toBe(ROUTING_KEY);
	});

	test("parseHostWsRoute decodes the host id and preserves the path", () => {
		const route = parseHostWsRoute(WS_URL);
		expect(route.hostId).toBe(ROUTING_KEY);
		expect(route.path).toBe("/terminal/does-not-exist");
		expect(route.query).toBe("token=jwt");
	});

	test("openWsChannel resolves the tunnel for an encoded routing key", () => {
		const manager = new TunnelManager();
		const sent: Array<Record<string, unknown>> = [];
		const tunnelWs: FakeWs = {
			readyState: 1,
			send: (data) => sent.push(JSON.parse(String(data))),
			close: () => {},
		};
		injectTunnel(manager, ROUTING_KEY, tunnelWs);

		const route = parseHostWsRoute(WS_URL);
		const clientWs: FakeWs = {
			readyState: 1,
			send: () => {},
			close: () => {},
		};

		// Before the fix this threw "Host not connected" → relay closed the
		// client with 1011 "Failed to open channel".
		const channelId = manager.openWsChannel(
			route.hostId,
			route.path,
			route.query,
			clientWs,
		);
		expect(typeof channelId).toBe("string");
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			type: "ws:open",
			path: "/terminal/does-not-exist",
		});
	});
});
