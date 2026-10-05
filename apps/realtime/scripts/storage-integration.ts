import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	exportJWK,
	generateKeyPair,
	type JWK,
	type KeyLike,
	SignJWT,
} from "jose";

const SECRET = "integration-nudge-secret";
const PORT = Number(process.env.PORT ?? 8799);
const JWKS_PORT = Number(process.env.JWKS_PORT ?? 8795);
const BUCKET = "superset-private";
const PERSIST = join(tmpdir(), "superset-page-storage-it");
const USERCONTENT = "http://frame.usercontent.localhost:9999";

const ORG = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
const ORG_PAGE = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const LEGACY_PAGE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const PRIVATE_PAGE = "cccccccc-3333-4333-8333-cccccccccccc";

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
	if (ok) {
		console.log(`  ok   ${name}`);
		return;
	}
	failures += 1;
	console.error(`  FAIL ${name}`, detail === undefined ? "" : detail);
};

function manifest(pageId: string, extra: Record<string, unknown>) {
	return JSON.stringify({
		v: 1,
		pageId,
		slug: pageId.slice(0, 8),
		sharedVersion: null,
		latestVersion: 1,
		versions: {
			"1": { key: `pages/${pageId}/v1.html`, contentType: "text/html" },
		},
		...extra,
	});
}

function seed(pageId: string, body: string) {
	const file = join(PERSIST, `${pageId}.json`);
	writeFileSync(file, body);
	const result = spawnSync(
		"bunx",
		[
			"wrangler",
			"r2",
			"object",
			"put",
			`${BUCKET}/pages/${pageId}/manifest.json`,
			"--file",
			file,
			"--local",
			"--persist-to",
			PERSIST,
			"--content-type",
			"application/json",
		],
		{ cwd: `${import.meta.dir}/..`, encoding: "utf8" },
	);
	if (result.status !== 0) {
		throw new Error(
			`seeding ${pageId} failed: ${result.stderr || result.stdout}`,
		);
	}
}

async function main() {
	rmSync(PERSIST, { recursive: true, force: true });
	mkdirSync(PERSIST, { recursive: true });

	const { publicKey, privateKey } = await generateKeyPair("RS256");
	const jwk = (await exportJWK(publicKey)) as JWK;
	jwk.kid = "test-key";
	jwk.alg = "RS256";
	jwk.use = "sig";

	const jwks = Bun.serve({
		port: JWKS_PORT,
		fetch(request) {
			if (new URL(request.url).pathname === "/api/auth/jwks") {
				return Response.json({ keys: [jwk] });
			}
			return new Response("not found", { status: 404 });
		},
	});
	const issuer = `http://localhost:${JWKS_PORT}`;

	const mint = (
		sub: string,
		organizationIds: string[],
		name = "Ada",
		image: string | null = null,
	) =>
		new SignJWT({ organizationIds, name, image })
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuer(issuer)
			.setAudience(issuer)
			.setSubject(sub)
			.setIssuedAt()
			.setExpirationTime("10m")
			.sign(privateKey as KeyLike);

	seed(
		ORG_PAGE,
		manifest(ORG_PAGE, {
			visibility: "org",
			organizationId: ORG,
			createdByUserId: AUTHOR,
		}),
	);
	seed(
		PRIVATE_PAGE,
		manifest(PRIVATE_PAGE, {
			visibility: "just_me",
			organizationId: ORG,
			createdByUserId: AUTHOR,
		}),
	);
	seed(LEGACY_PAGE, manifest(LEGACY_PAGE, { visibility: "org" }));

	writeFileSync(
		join(import.meta.dir, "..", ".dev.vars.integration"),
		[
			`NUDGE_SECRET=${SECRET}`,
			`NEXT_PUBLIC_API_URL=${issuer}`,
			`USERCONTENT_URL=${USERCONTENT}`,
			"",
		].join("\n"),
	);

	const base = `http://127.0.0.1:${PORT}`;
	try {
		await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) });
		console.error(
			`something is already listening on ${PORT}; stop it first (pkill -f "wrangler dev")`,
		);
		jwks.stop();
		process.exit(1);
	} catch {}

	const worker = spawn(
		"bunx",
		[
			"wrangler",
			"dev",
			"--local",
			"--port",
			String(PORT),
			"--persist-to",
			PERSIST,
			"--env-file",
			".dev.vars.integration",
		],
		{ cwd: join(import.meta.dir, ".."), stdio: ["ignore", "pipe", "pipe"] },
	);
	let shuttingDown = false;
	const shutdown = () => {
		if (shuttingDown) return;
		shuttingDown = true;
		try {
			worker.kill("SIGKILL");
		} catch {}
		try {
			jwks.stop();
		} catch {}
	};
	process.on("SIGINT", () => {
		shutdown();
		process.exit(130);
	});
	process.on("SIGTERM", () => {
		shutdown();
		process.exit(143);
	});

	const log: string[] = [];
	worker.stdout?.on("data", (chunk) => log.push(String(chunk)));
	worker.stderr?.on("data", (chunk) => log.push(String(chunk)));

	let up = false;
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const health = await fetch(`${base}/health`);
			if (health.ok) {
				up = true;
				break;
			}
		} catch {}
		await new Promise((r) => setTimeout(r, 1000));
	}
	if (!up) {
		console.error(`the worker never came up:\n${log.join("")}`);
		worker.kill("SIGTERM");
		jwks.stop();
		process.exit(1);
	}

	const ticket = async (pageId: string, jwt: string, name = "Ada") => {
		const response = await fetch(`${base}/v2/page/${pageId}/storage/ticket`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${jwt}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ name, image: null }),
		});
		const body = (await response.json().catch(() => null)) as {
			ticket?: string;
			fallback?: boolean;
			error?: string;
		} | null;
		return {
			status: response.status,
			body,
			url: body?.ticket
				? `ws://127.0.0.1:${PORT}/v2/page/${pageId}/storage/socket?ticket=${encodeURIComponent(body.ticket)}`
				: null,
		};
	};

	const open = (url: string, origin: string) =>
		new Promise<{ socket: WebSocket; first: unknown }>((resolve, reject) => {
			const socket = new WebSocket(url, { headers: { origin } } as never);
			const timer = setTimeout(() => reject(new Error("open timeout")), 8000);
			socket.addEventListener("message", (event) => {
				clearTimeout(timer);
				resolve({ socket, first: JSON.parse(String(event.data)) });
			});
			socket.addEventListener("close", (event) => {
				clearTimeout(timer);
				reject(new Error(`closed ${event.code} ${event.reason}`));
			});
		});

	const rpc = (socket: WebSocket, request: unknown, id: string) =>
		new Promise<Record<string, unknown>>((resolve, reject) => {
			const onMessage = (event: MessageEvent) => {
				const data = JSON.parse(String(event.data));
				if (data.id !== id) return;
				socket.removeEventListener("message", onMessage as never);
				resolve(data);
			};
			socket.addEventListener("message", onMessage as never);
			setTimeout(() => reject(new Error("rpc timeout")), 8000);
			socket.send(JSON.stringify({ type: "call", id, request }));
		});

	const authorJwt = await mint(AUTHOR, [ORG], "Ada");
	const memberJwt = await mint(MEMBER, [ORG], "Grace");
	const outsiderJwt = await mint(OUTSIDER, [
		"99999999-9999-4999-8999-999999999999",
	]);
	const pageOrigin = `http://${ORG_PAGE}.frame.usercontent.localhost:9999`;

	console.log("\nticket route");
	const noAuth = await fetch(`${base}/v2/page/${ORG_PAGE}/storage/ticket`, {
		method: "POST",
	});
	check("refuses a request with no JWT", noAuth.status === 401, noAuth.status);

	const outsiderTicket = await ticket(ORG_PAGE, outsiderJwt);
	check(
		"refuses a viewer from another organization",
		outsiderTicket.status === 403,
		outsiderTicket,
	);

	const privateForMember = await ticket(PRIVATE_PAGE, memberJwt);
	check(
		"refuses a just_me page to a non-author",
		privateForMember.status === 403,
		privateForMember,
	);

	const privateForAuthor = await ticket(PRIVATE_PAGE, authorJwt);
	check(
		"issues a just_me ticket to its author",
		privateForAuthor.status === 200 && Boolean(privateForAuthor.body?.ticket),
		privateForAuthor,
	);

	const legacy = await ticket(LEGACY_PAGE, memberJwt);
	check(
		"refuses a manifest with no organization",
		legacy.status === 403,
		legacy,
	);

	const missing = await ticket(
		"dddddddd-4444-4444-8444-dddddddddddd",
		memberJwt,
	);
	check("404s a page with no manifest", missing.status === 404, missing.status);

	const authorTicket = await ticket(ORG_PAGE, authorJwt);
	check(
		"issues a ticket for an org page",
		authorTicket.status === 200 && Boolean(authorTicket.body?.ticket),
		authorTicket,
	);

	const spoofed = await ticket(ORG_PAGE, memberJwt, "Ada");
	const spoofedOpen = await open(String(spoofed.url), pageOrigin).catch(
		() => null,
	);
	check(
		"a body-supplied name cannot override the token's",
		(spoofedOpen?.first as { viewer?: { name?: string } } | undefined)?.viewer
			?.name === "Grace",
		spoofedOpen?.first,
	);
	spoofedOpen?.socket.close();

	console.log("\nsocket");
	const url = String(authorTicket.url);
	console.log(`  (ticket url: ${url.replace(/ticket=[^&]+/, "ticket=...")})`);

	let wrongOrigin: string | null = null;
	try {
		await open(url, "https://evil.example");
		wrongOrigin = "stayed open";
	} catch (error) {
		wrongOrigin = (error as Error).message;
	}
	check(
		"closes a socket whose Origin is not the page's frame origin",
		wrongOrigin?.includes("4403") === true,
		wrongOrigin,
	);

	const fresh = await ticket(ORG_PAGE, authorJwt);
	const first = await open(String(fresh.url), pageOrigin).catch((error) => {
		console.error("  correct-origin open failed:", (error as Error).message);
		console.error(
			`  worker log:\n${log.join("").split("\n").slice(-25).join("\n")}`,
		);
		return null;
	});
	if (!first) {
		shutdown();
		process.exit(1);
	}
	const hello = first.first as Record<string, unknown>;
	check(
		"hello carries viewer, author and writable",
		hello.type === "hello" &&
			(hello.viewer as Record<string, unknown>).userId === AUTHOR &&
			hello.author === true &&
			hello.writable === true,
		hello,
	);

	let replay: string | null = null;
	try {
		await open(String(fresh.url), pageOrigin);
		replay = "stayed open";
	} catch (error) {
		replay = (error as Error).message;
	}
	check(
		"refuses the same ticket a second time",
		replay?.includes("4401") === true,
		replay,
	);

	console.log("\nstorage over the socket");
	const wrote = await rpc(
		first.socket,
		{ op: "set", key: "vote", value: "Ramen" },
		"c1",
	);
	check("a write is accepted", wrote.ok === true, wrote);

	const read = await rpc(first.socket, { op: "getAll", key: "vote" }, "c2");
	const records = (read.result as { records: Record<string, unknown>[] })
		.records;
	check(
		"getAll returns the record with the name from the visit row",
		records.length === 1 &&
			records[0]?.userId === AUTHOR &&
			records[0]?.name === "Ada" &&
			records[0]?.value === "Ramen",
		records,
	);

	const tooBig = await rpc(
		first.socket,
		{ op: "set", key: "vote", value: "x".repeat(70 * 1024) },
		"c3",
	);
	check(
		"refuses an over-size value with quota_exceeded",
		tooBig.ok === false && tooBig.code === "quota_exceeded",
		tooBig,
	);

	console.log("\npush between two viewers");
	const second = await ticket(ORG_PAGE, memberJwt);
	const other = await open(String(second.url), pageOrigin);
	check(
		"a second viewer connects",
		(other.first as { type: string }).type === "hello",
	);

	const pushed = new Promise<Record<string, unknown>>((resolve, reject) => {
		const onMessage = (event: MessageEvent) => {
			const data = JSON.parse(String(event.data));
			if (data.type !== "records") return;
			first.socket.removeEventListener("message", onMessage as never);
			resolve(data);
		};
		first.socket.addEventListener("message", onMessage as never);
		setTimeout(() => reject(new Error("no push")), 8000);
	});
	await rpc(other.socket, { op: "set", key: "vote", value: "Tacos" }, "c4");
	const push = await pushed.catch((error) => ({ error: String(error) }));
	check(
		"the first viewer is pushed both records without asking",
		(push as { type?: string }).type === "records" &&
			((push as { records: unknown[] }).records ?? []).length === 2,
		push,
	);

	console.log("\nrevocation");
	const nudge = await fetch(
		`${base}/v2/page/${ORG_PAGE}/storage/manifest-changed`,
		{ method: "POST", headers: { authorization: `Bearer ${SECRET}` } },
	);
	check("the nudge route accepts the shared secret", nudge.ok, nudge.status);

	const nudgeNoSecret = await fetch(
		`${base}/v2/page/${ORG_PAGE}/storage/manifest-changed`,
		{ method: "POST" },
	);
	check("the nudge route refuses without it", nudgeNoSecret.status === 401);

	let sawRevoked = false;
	first.socket.addEventListener("message", (event) => {
		const data = JSON.parse(String(event.data));
		if (data.type === "revoked") sawRevoked = true;
	});
	const closed = new Promise<string>((resolve) => {
		first.socket.addEventListener("close", (event) => resolve(`${event.code}`));
		setTimeout(() => resolve("still open"), 8000);
	});
	seed(
		ORG_PAGE,
		manifest(ORG_PAGE, {
			visibility: "just_me",
			organizationId: ORG,
			createdByUserId: OUTSIDER,
		}),
	);
	await fetch(`${base}/v2/page/${ORG_PAGE}/storage/manifest-changed`, {
		method: "POST",
		headers: { authorization: `Bearer ${SECRET}` },
	});
	const outcome = await closed;
	check(
		"a manifest change closes a socket that no longer passes",
		outcome === "4403",
		outcome,
	);
	check("the page is told why before the socket goes", sawRevoked, {
		sawRevoked,
	});

	console.log("\nadmin route");
	const unauthorizedAdmin = await fetch(
		`${base}/v2/page/${ORG_PAGE}/storage/admin`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ op: "clear" }),
		},
	);
	check(
		"admin refuses without the shared secret",
		unauthorizedAdmin.status === 401,
	);

	const purged = await fetch(`${base}/v2/page/${ORG_PAGE}/storage/admin`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${SECRET}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ op: "clearUser", userId: AUTHOR }),
	});
	const purgedBody = (await purged.json()) as { cleared?: number };
	check(
		"clearUser drops one person's records for an account purge",
		purged.ok && (purgedBody.cleared ?? 0) >= 1,
		purgedBody,
	);

	const wiped = await fetch(`${base}/v2/page/${ORG_PAGE}/storage/admin`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${SECRET}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ op: "clear" }),
	});
	const wipedBody = (await wiped.json()) as { cleared?: number };
	check(
		"clear wipes what is left, for page delete",
		wiped.ok && (wipedBody.cleared ?? 0) >= 1,
		wipedBody,
	);

	shutdown();

	console.log(
		failures === 0
			? "\nall integration checks passed"
			: `\n${failures} integration check(s) failed`,
	);
	process.exit(failures === 0 ? 0 : 1);
}

await main();
