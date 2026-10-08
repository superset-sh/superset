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
const PUBLIC_PAGE = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee";
const GUEST = "f0f0f0f0-6666-4666-8666-f0f0f0f0f0f0";

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
	seed(
		PUBLIC_PAGE,
		manifest(PUBLIC_PAGE, {
			visibility: "everyone",
			organizationId: ORG,
			createdByUserId: AUTHOR,
		}),
	);

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

	console.log("\nreadback route");
	const readback = async (pageId: string, jwt: string | null, key?: string) => {
		const query = key === undefined ? "" : `?key=${encodeURIComponent(key)}`;
		const response = await fetch(
			`${base}/v2/page/${pageId}/storage/records${query}`,
			{ headers: jwt ? { authorization: `Bearer ${jwt}` } : {} },
		);
		return {
			status: response.status,
			body: (await response.json().catch(() => null)) as Record<
				string,
				unknown
			> | null,
		};
	};

	const readbackNoAuth = await readback(ORG_PAGE, null);
	check(
		"readback refuses a request with no JWT",
		readbackNoAuth.status === 401,
		readbackNoAuth,
	);

	const memberKeys = await readback(ORG_PAGE, memberJwt);
	const memberRecords = await readback(ORG_PAGE, memberJwt, "vote");
	const memberKeyList = (memberKeys.body?.keys ?? []) as Record<
		string,
		unknown
	>[];
	check(
		"readback lets an org member who did not create the page read it",
		memberKeys.status === 200 &&
			memberKeyList.length === 1 &&
			memberKeyList[0]?.key === "vote" &&
			memberKeyList[0]?.records === 2 &&
			memberRecords.status === 200 &&
			((memberRecords.body?.records ?? []) as unknown[]).length === 2,
		{ memberKeys, memberRecords },
	);

	const readbackOutsider = await readback(ORG_PAGE, outsiderJwt);
	check(
		"readback refuses a viewer from another organization",
		readbackOutsider.status === 403,
		readbackOutsider,
	);

	const readbackPrivate = await readback(PRIVATE_PAGE, memberJwt);
	check(
		"readback refuses a just_me page to a non-author",
		readbackPrivate.status === 403,
		readbackPrivate,
	);

	const readbackMissing = await readback(
		"dddddddd-4444-4444-8444-dddddddddddd",
		authorJwt,
	);
	check(
		"readback 404s a page with no manifest",
		readbackMissing.status === 404,
		readbackMissing,
	);

	const readbackEmptyKey = await readback(ORG_PAGE, authorJwt, "");
	check(
		"readback refuses an empty key",
		readbackEmptyKey.status === 400,
		readbackEmptyKey,
	);

	const keyList = await readback(ORG_PAGE, authorJwt);
	const keys = (keyList.body?.keys ?? []) as Record<string, unknown>[];
	check(
		"readback lists each key with its record count for the author",
		keyList.status === 200 &&
			keys.length === 1 &&
			keys[0]?.key === "vote" &&
			keys[0]?.records === 2,
		keyList,
	);

	const keyRecords = await readback(ORG_PAGE, authorJwt, "vote");
	const slots = (keyRecords.body?.records ?? []) as Record<string, unknown>[];
	check(
		"readback returns every person's slot for one key",
		keyRecords.status === 200 &&
			slots.map((slot) => `${slot.name}=${slot.value}`).join(",") ===
				"Ada=Ramen,Grace=Tacos",
		keyRecords,
	);

	const oauthJwt = await new SignJWT({
		organizationId: ORG,
		organizationIds: [ORG],
		azp: "superset-cli",
		scope: "openid profile email offline_access",
	})
		.setProtectedHeader({ alg: "RS256", kid: "test-key" })
		.setIssuer(issuer)
		.setAudience(issuer)
		.setSubject(AUTHOR)
		.setIssuedAt()
		.setExpirationTime("10m")
		.sign(privateKey as KeyLike);
	const readbackOAuth = await readback(ORG_PAGE, oauthJwt);
	check(
		"readback accepts a token shaped like the CLI's OAuth access token",
		readbackOAuth.status === 200,
		readbackOAuth,
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

	console.log("\npresence");
	const presenceUrl = (pageId: string, query: string) =>
		`ws://127.0.0.1:${PORT}/v2/page/${pageId}/presence${query}`;
	const enter = (pageId: string, query: string) => {
		const inbox: Record<string, unknown>[] = [];
		const socket = new WebSocket(presenceUrl(pageId, query));
		let closed: { code: number; reason: string } | null = null;
		socket.addEventListener("message", (event) => {
			const data = String(event.data);
			inbox.push(data === "pong" ? { type: "pong" } : JSON.parse(data));
		});
		socket.addEventListener("close", (event) => {
			closed = { code: event.code, reason: event.reason };
		});
		const waitFor = async (
			match: (message: Record<string, unknown>) => boolean,
		) => {
			for (let tries = 0; tries < 80; tries++) {
				const found = inbox.findLast(match);
				if (found) return found;
				await new Promise((r) => setTimeout(r, 100));
			}
			return null;
		};
		const waitClosed = async () => {
			for (let tries = 0; tries < 80 && closed === null; tries++) {
				await new Promise((r) => setTimeout(r, 100));
			}
			return closed as { code: number; reason: string } | null;
		};
		return { socket, inbox, waitFor, waitClosed };
	};
	const viewersOf = (message: Record<string, unknown> | null) =>
		(message?.viewers ?? []) as {
			key: string;
			name: string;
			guest: boolean;
			guestNumber: number | null;
			color: number;
		}[];

	const anonymous = enter(PUBLIC_PAGE, "");
	check(
		"presence refuses a socket with neither a token nor a guest id",
		(await anonymous.waitClosed())?.code === 4401,
	);

	const outsiderPresence = enter(PUBLIC_PAGE, `?token=${outsiderJwt}`);
	check(
		"presence refuses a signed-in viewer outside the org (they join as guests)",
		(await outsiderPresence.waitClosed())?.code === 4403,
	);

	const privateGuest = enter(PRIVATE_PAGE, `?guest=${GUEST}`);
	check(
		"presence refuses a guest on a page not shared with everyone",
		(await privateGuest.waitClosed())?.code === 4403,
	);

	const badPage = enter("not-a-page", `?guest=${GUEST}`);
	check(
		"presence refuses a malformed page id",
		(await badPage.waitClosed())?.code === 4403,
	);

	const member = enter(PUBLIC_PAGE, `?token=${memberJwt}`);
	await member.waitFor((m) => m.type === "presence");
	const guest = enter(PUBLIC_PAGE, `?guest=${GUEST}`);
	const guestSees = await guest.waitFor(
		(m) =>
			m.type === "presence" && viewersOf(m).some((v) => v.name === "Grace"),
	);
	check("a guest sees the member already here", Boolean(guestSees));
	const memberSees = await member.waitFor(
		(m) => m.type === "presence" && viewersOf(m).some((v) => v.guest),
	);
	check("the member is told a guest arrived", Boolean(memberSees));
	check(
		"nobody is listed to themselves, and the first guest is Guest 1",
		!viewersOf(memberSees).some((v) => v.name === "Grace") &&
			viewersOf(memberSees).find((v) => v.guest)?.guestNumber === 1,
		memberSees,
	);

	const memberList = await guest.waitFor(
		(m) => m.type === "presence" && viewersOf(m).length > 0,
	);
	const sent = JSON.stringify(memberList);
	check(
		"viewers get an opaque per-page key, never an internal user id",
		!sent.includes(MEMBER) &&
			!sent.includes(GUEST) &&
			viewersOf(memberList).every((v) => /^[0-9a-f]{16}$/.test(v.key)),
		memberList,
	);
	check(
		"the member and the guest are given different colours",
		viewersOf(memberSees)[0]?.color !== viewersOf(memberList)[0]?.color,
		{ member: viewersOf(memberList), guest: viewersOf(memberSees) },
	);

	member.socket.send("ping");
	check(
		"the hub answers a heartbeat ping",
		Boolean(await member.waitFor((m) => m.type === "pong")),
	);

	guest.socket.send(
		JSON.stringify({
			type: "call",
			id: "g1",
			request: { op: "getAll", key: "vote" },
		}),
	);
	const writer = await open(
		String((await ticket(PUBLIC_PAGE, memberJwt, "Grace")).url),
		`http://${PUBLIC_PAGE}.frame.usercontent.localhost:9999`,
	);
	await rpc(writer.socket, { op: "set", key: "vote", value: "Ramen" }, "w1");
	await new Promise((r) => setTimeout(r, 300));
	check(
		"presence sockets never answer storage calls or receive storage records",
		!guest.inbox.some((m) => m.id === "g1" || m.type === "records") &&
			!member.inbox.some((m) => m.type === "records"),
	);
	writer.socket.close();

	const otherGuest = crypto.randomUUID();
	const tabs = [
		enter(PUBLIC_PAGE, `?guest=${otherGuest}`),
		enter(PUBLIC_PAGE, `?guest=${otherGuest}`),
	];
	const numbered = await member.waitFor(
		(m) =>
			m.type === "presence" && viewersOf(m).filter((v) => v.guest).length === 3,
	);
	check(
		"guests are numbered, and one guest in two tabs keeps one number",
		viewersOf(numbered)
			.filter((v) => v.guest)
			.map((v) => v.guestNumber)
			.sort()
			.join(",") === "1,2,2",
		viewersOf(numbered),
	);
	for (const tab of tabs) tab.socket.close();
	await member.waitFor(
		(m) =>
			m.type === "presence" && viewersOf(m).filter((v) => v.guest).length === 1,
	);

	const crowd = [];
	for (let n = 0; n < 19; n++) {
		const extra = enter(PUBLIC_PAGE, `?guest=${crypto.randomUUID()}`);
		await extra.waitFor((m) => m.type === "presence");
		crowd.push(extra);
	}
	const turnedAway = enter(PUBLIC_PAGE, `?guest=${crypto.randomUUID()}`);
	check(
		"the 21st guest on a page is turned away as full",
		(await turnedAway.waitClosed())?.code === 4429,
	);
	for (const extra of crowd) extra.socket.close();

	seed(
		PUBLIC_PAGE,
		manifest(PUBLIC_PAGE, {
			visibility: "org",
			organizationId: ORG,
			createdByUserId: AUTHOR,
		}),
	);
	await fetch(`${base}/v2/page/${PUBLIC_PAGE}/storage/manifest-changed`, {
		method: "POST",
		headers: { authorization: `Bearer ${SECRET}` },
	});
	check(
		"un-sharing a page closes its guests",
		(await guest.waitClosed())?.code === 4403,
	);
	const afterGuest = await member.waitFor(
		(m) => m.type === "presence" && !viewersOf(m).some((v) => v.guest),
	);
	check(
		"members stay, and are told the guest left",
		Boolean(afterGuest) && member.socket.readyState === WebSocket.OPEN,
	);
	member.socket.close();

	let limited = false;
	for (let n = 0; n < 130 && !limited; n++) {
		const knock = enter(PUBLIC_PAGE, `?guest=${crypto.randomUUID()}`);
		const closed = await knock.waitClosed();
		limited = closed?.code === 4429 && closed.reason === "Too many requests";
	}
	check("guest presence is rate-limited per client", limited);

	shutdown();

	console.log(
		failures === 0
			? "\nall integration checks passed"
			: `\n${failures} integration check(s) failed`,
	);
	process.exit(failures === 0 ? 0 : 1);
}

await main();
