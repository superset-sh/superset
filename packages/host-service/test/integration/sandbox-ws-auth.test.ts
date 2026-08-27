import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PskHostAuthProvider } from "../../src/providers/host-auth";
import { getWorkspaceSandboxPaths } from "../../src/runtime/sandbox/paths";
import {
	ensureCliTokenFile,
	resetCliTokensForTests,
} from "../../src/runtime/sandbox/sandbox-cli-tokens";
import { createTestHost } from "../helpers/createTestHost";

const WS = "11111111-1111-4111-8111-111111111111";
const PSK = "test-psk-ws-auth";

let host: Awaited<ReturnType<typeof createTestHost>>;
let sandboxToken: string;

beforeEach(async () => {
	resetCliTokensForTests();
	host = await createTestHost({
		psk: PSK,
		hostAuth: new PskHostAuthProvider(PSK),
	});
	await ensureCliTokenFile(WS);
	sandboxToken = readFileSync(
		join(getWorkspaceSandboxPaths(WS).stateDir, "host", "token"),
		"utf-8",
	).trim();
});

afterEach(async () => {
	await host.dispose();
	resetCliTokensForTests();
});

// A sandbox bearer must not reach a host-scoped WS route (/events) even when
// paired with a junk ?token= value — the ACL keys off BOTH channels (CWE-863).
test("sandbox bearer + junk query token is still denied /events", async () => {
	const res = await host.fetch(
		new Request(`http://local/events?token=${host.psk}-not-real`, {
			headers: { authorization: `Bearer ${sandboxToken}` },
		}),
	);
	expect(res.status).toBe(403);
});

test("sandbox token via query param is denied /events", async () => {
	const res = await host.fetch(
		new Request(`http://local/events?token=${sandboxToken}`),
	);
	expect(res.status).toBe(403);
});
