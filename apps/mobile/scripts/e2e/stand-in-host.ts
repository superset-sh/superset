/**
 * A host for the local relay that needs no second machine. `register` makes it
 * exist, `online` holds the relay control socket open, and that socket is all
 * presence looks at, so no tunnel protocol is spoken.
 *
 *   bun --env-file=../../.env scripts/e2e/stand-in-host.ts register --id e2e-mini --name "Mac mini"
 *   bun --env-file=../../.env scripts/e2e/stand-in-host.ts online --id e2e-mini --seconds 60
 *   bun --env-file=../../.env scripts/e2e/stand-in-host.ts presence --id e2e-mini
 *   bun --env-file=../../.env scripts/e2e/stand-in-host.ts delete --id e2e-mini
 */
import { parseArgs } from "node:util";

const DEV_EMAIL = "admin@local.test";
const DEV_PASSWORD = "supersetdev";

const apiUrl = requireLocal("EXPO_PUBLIC_API_URL");
const relayUrl = requireLocal("EXPO_PUBLIC_RELAY_URL");
const origin = requireLocal("EXPO_PUBLIC_WEB_URL");

function requireLocal(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set; pass --env-file=../../.env`);
	const { hostname } = new URL(value);
	if (hostname !== "localhost" && hostname !== "127.0.0.1") {
		throw new Error(
			`${name}=${value} is not local; refusing to register hosts`,
		);
	}
	return value.replace(/\/$/, "");
}

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		id: { type: "string" },
		name: { type: "string", default: "Stand-in host" },
		seconds: { type: "string", default: "60" },
	},
});
const [command] = positionals;
if (!command || !values.id) {
	throw new Error(
		"usage: stand-in-host.ts <register|online|presence|delete> --id <machineId>",
	);
}
const machineId = values.id;

async function signIn(): Promise<{ cookie: string; organizationId: string }> {
	const body = JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD });
	const headers = { "content-type": "application/json", origin };
	const response = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
		method: "POST",
		headers,
		body,
	});
	if (!response.ok) {
		throw new Error(
			`Dev sign-in failed (${response.status}). Tap "Dev sign in" in the app once so the account exists.`,
		);
	}
	const cookie = response.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ");
	const session = await (
		await fetch(`${apiUrl}/api/auth/get-session`, { headers: { cookie } })
	).json();
	const organizationId = session?.session?.activeOrganizationId;
	if (!organizationId)
		throw new Error("The dev account has no active organization");
	return { cookie, organizationId };
}

async function mintJwt(cookie: string): Promise<string> {
	const response = await fetch(`${apiUrl}/api/auth/token`, {
		headers: { cookie, origin },
	});
	const { token } = (await response.json()) as { token?: string };
	if (!token) throw new Error("No JWT returned for the dev session");
	return token;
}

async function trpcMutation(
	path: string,
	input: unknown,
	headers: Record<string, string>,
): Promise<unknown> {
	const response = await fetch(`${apiUrl}/api/trpc/${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", origin, ...headers },
		body: JSON.stringify({ json: input }),
	});
	const payload = await response.json();
	if (!response.ok) throw new Error(`${path}: ${JSON.stringify(payload)}`);
	return payload;
}

const { cookie, organizationId } = await signIn();
const routingKey = `${organizationId}:${machineId}`;

if (command === "register") {
	const jwt = await mintJwt(cookie);
	await trpcMutation(
		"host.ensure",
		{
			organizationId,
			machineId,
			name: values.name,
			version: "0.0.0-e2e",
			platform: "darwin",
		},
		{ authorization: `Bearer ${jwt}` },
	);
	console.log(`registered ${routingKey}`);
} else if (command === "delete") {
	await trpcMutation("host.delete", { hostId: machineId }, { cookie });
	console.log(`deleted ${routingKey}`);
} else if (command === "presence") {
	const jwt = await mintJwt(cookie);
	const response = await fetch(
		`${relayUrl}/presence?hostIds=${encodeURIComponent(routingKey)}`,
		{ headers: { authorization: `Bearer ${jwt}` } },
	);
	console.log(JSON.stringify((await response.json()).hosts?.[routingKey]));
} else if (command === "online") {
	const jwt = await mintJwt(cookie);
	const socket = new WebSocket(
		`${relayUrl.replace(/^http/, "ws")}/v2/control?hostId=${encodeURIComponent(routingKey)}`,
		// Bun's WebSocket takes headers; the DOM type does not know that.
		{ headers: { authorization: `Bearer ${jwt}` } } as unknown as string[],
	);
	socket.onopen = () => console.log(`online ${routingKey}`);
	socket.onclose = (event) => {
		console.log(`offline ${routingKey} (${event.code} ${event.reason})`);
		process.exit(event.code === 1000 ? 0 : 1);
	};
	setTimeout(() => socket.close(1000, "done"), Number(values.seconds) * 1000);
} else {
	throw new Error(`unknown command: ${command}`);
}
