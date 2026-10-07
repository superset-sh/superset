import { afterAll, expect, test } from "bun:test";
import { open, seal } from "../secret-box";
import { openGitlabLfsAction, rewriteGitlabLfsBatch } from "./lfs-actions";

const previousKey = process.env.SECRETS_ENCRYPTION_KEY;
process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 23).toString("base64");
afterAll(() => {
	if (previousKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
	else process.env.SECRETS_ENCRYPTION_KEY = previousKey;
});
const scope = {
	organizationId: "org-owned",
	workspaceId: "ws-owned",
	connectionId: "conn-owned",
	providerTeamId: "team-owned",
	providerProjectId: "prj-owned",
	sandboxId: "sbx-current",
	sandboxName: "owned-sandbox",
	projectId: 42,
	projectPath: "group/sub/repo",
	origin: "https://gitlab.example.com",
};
const now = 1_800_000_000;
const organizationToken = "OWNED_ORGANIZATION_CREDENTIAL";
const oid = "a".repeat(64);
const otherOid = "b".repeat(64);
const root =
	"https://gitlab.example.com/group/sub/repo.git/gitlab-lfs/objects/";
const batch = (operation = "download", size = 0) => ({
	operation,
	objects: [{ oid, size }],
	ref: null,
});
const response = (actions?: Record<string, unknown>, size = 0) => ({
	objects: [{ oid, size, ...(actions === undefined ? {} : { actions }) }],
});
const rewrite = (upstream: unknown, operation = "download", size = 0) =>
	rewriteGitlabLfsBatch({
		scope,
		batch: batch(operation, size),
		response: upstream,
		organizationToken,
		now,
	});
const actionPath = (
	upstream: unknown,
	action: "download" | "upload" | "verify" = "download",
	operation = "download",
	size = 0,
) => {
	const result = rewrite(upstream, operation, size);
	const href = result.objects[0]?.actions?.[action]?.href;
	expect(typeof href).toBe("string");
	if (typeof href !== "string") throw new Error("Missing LFS capability");
	return new URL(href).pathname;
};
const readAction = (
	path: string,
	method = "GET",
	body?: string,
	currentScope = scope,
	at = now,
) => openGitlabLfsAction({ scope: currentScope, path, method, body, now: at });

test("download capabilities hide URLs and credentials and decrypt actual AES-GCM for only the selected scope", () => {
	const upstream = response({
		download: {
			href: root + oid,
			header: { Authorization: "Basic OWNED_LFS_ACTION" },
		},
	});
	const result = rewrite(upstream);
	const href = result.objects[0]?.actions?.download?.href;
	expect(href).toStartWith("https://gitlab.example.com/.superset/lfs/");
	expect(result.objects[0]?.authenticated).toBe(true);
	expect(result.objects[0]?.actions?.download?.expires_in).toBe(3600);
	const output = JSON.stringify(result);
	for (const privateValue of [
		"OWNED_LFS_ACTION",
		"gitlab-lfs",
		organizationToken,
		"org-owned",
		"ws-owned",
	])
		expect(output).not.toContain(privateValue);
	if (typeof href !== "string") throw new Error("Missing LFS capability");
	const plan = readAction(new URL(href).pathname);
	expect(plan).toMatchObject({
		operation: "download",
		action: "download",
		method: "GET",
		oid,
		size: 0,
		url: root + oid,
		headers: { authorization: "Basic OWNED_LFS_ACTION" },
		expiresAt: now + 3600,
		offHost: false,
	});
	expect(rewrite(upstream).objects[0]?.actions?.download?.href).not.toBe(href);
});
test("upload removes valid GitLab chunked framing and binds zero size and verify body", () => {
	const upstream = response({
		upload: {
			href: `${root + oid}/0`,
			header: {
				Authorization: "Basic OWNED_LFS_ACTION",
				"Content-Type": "application/octet-stream",
				"Transfer-Encoding": "chunked",
				"Content-Length": "0",
			},
		},
		verify: { href: `${root + oid}/verify` },
	});
	const uploaded = readAction(actionPath(upstream, "upload", "upload"), "PUT");
	expect(uploaded.headers).toEqual({
		authorization: "Basic OWNED_LFS_ACTION",
		"content-type": "application/octet-stream",
	});
	expect(uploaded).toMatchObject({ method: "PUT", size: 0, offHost: false });
	const path = actionPath(upstream, "verify", "upload");
	expect(
		readAction(path, "POST", JSON.stringify({ oid, size: 0 })),
	).toMatchObject({ action: "verify", method: "POST", oid, size: 0 });
	for (const body of [
		JSON.stringify({ oid: otherOid, size: 0 }),
		JSON.stringify({ oid, size: 1 }),
		JSON.stringify({ oid, size: 0, sudo: 1 }),
		"[]",
		"null",
		undefined,
	])
		expect(() => readAction(path, "POST", body)).toThrow();
});
test.each([
	"Basic " +
		Buffer.from("storage-user:OWNED_STORAGE_PASSWORD").toString("base64"),
	"Bearer OWNED_SCOPED_STORAGE_TOKEN",
])("retains distinct private off-host auth %s", (auth) => {
	const url =
		"https://objects.example.com/signed/object?signature=OWNED_SIGNATURE";
	const path = actionPath(
		response({
			download: {
				href: url,
				header: {
					Authorization: auth,
					"x-amz-security-token": "OWNED_STORAGE_SESSION",
				},
				expires_in: 1800,
			},
		}),
	);
	expect(readAction(path)).toMatchObject({
		url,
		offHost: true,
		headers: {
			authorization: auth,
			"x-amz-security-token": "OWNED_STORAGE_SESSION",
		},
		expiresAt: now + 1800,
	});
	expect(path).not.toContain("OWNED");
});
test.each([
	{ href: `https://objects.example.com/${organizationToken}` },
	{ href: `https://objects.example.com/object?token=${organizationToken}` },
	{
		href:
			"https://objects.example.com/object?token=" +
			organizationToken
				.split("")
				.map((c) => `%${c.charCodeAt(0).toString(16)}`)
				.join(""),
	},
	{
		href: "https://objects.example.com/object",
		header: { Authorization: organizationToken },
	},
	{
		href: "https://objects.example.com/object",
		header: { Authorization: `Bearer ${organizationToken}` },
	},
	{
		href: "https://objects.example.com/object",
		header: { "PRIVATE-TOKEN": organizationToken },
	},
	{
		href: "https://objects.example.com/object",
		header: {
			Authorization: `Basic ${Buffer.from(`user:${organizationToken}`).toString("base64")}`,
		},
	},
])("rejects off-host organization credential replay %#", (action) =>
	expect(() => rewrite(response({ download: action }))).toThrow());
test.each([
	" ",
	"   ",
])("rejects padded Basic organization credential replay %#", (padding) => {
	const Authorization = `${padding}Basic ${Buffer.from(`user:${organizationToken}`).toString("base64")} `;
	expect(() =>
		rewrite(
			response({
				download: {
					href: "https://objects.example.com/object",
					header: { Authorization },
				},
			}),
		),
	).toThrow("Invalid GitLab LFS action");
});
test("rejects padded Basic organization credential used as the username", () => {
	const Authorization = ` Basic ${Buffer.from(`${organizationToken}:unused`).toString("base64")}`;
	expect(() =>
		rewrite(
			response({
				download: {
					href: "https://objects.example.com/object",
					header: { Authorization },
				},
			}),
		),
	).toThrow("Invalid GitLab LFS action");
});
test("retains distinct padded scoped Basic action auth after canonicalization", () => {
	const canonical = `Basic ${Buffer.from("scoped:OWNED_STORAGE_ACTION_PASSWORD").toString("base64")}`;
	const path = actionPath(
		response({
			download: {
				href: "https://objects.example.com/object",
				header: { Authorization: `   ${canonical} ` },
			},
		}),
	);
	expect(readAction(path)).toMatchObject({
		offHost: true,
		headers: { authorization: canonical },
	});
});
test("strips nominated hop/framing/cookie/proxy/provider headers without exposing other action headers", () => {
	const path = actionPath(
		response({
			download: {
				href: root + oid,
				header: {
					Connection: "x-private",
					"Proxy-Connection": "keep-alive",
					"X-Private": "nominated",
					Cookie: "hidden",
					"Proxy-Authorization": "hidden",
					"vercel-sandbox-oidc-token": "hidden",
					"X-Keep": "value",
					TE: "trailers",
					"Transfer-Encoding": "chunked",
					Host: "foreign",
					"Content-Length": "999",
				},
			},
		}),
	);
	expect(readAction(path).headers).toEqual({ "x-keep": "value" });
});
test("already-uploaded objects and per-object errors emit no upstream private metadata", () => {
	expect(rewrite(response(), "upload")).toEqual({
		transfer: "basic",
		objects: [{ oid, size: 0 }],
		hash_algo: "sha256",
	});
	const result = rewrite({
		objects: [
			{
				oid,
				size: 0,
				error: { code: 404, message: organizationToken, private: root + oid },
				private: "owned",
			},
		],
		private: organizationToken,
	});
	expect(result).toEqual({
		transfer: "basic",
		objects: [
			{
				oid,
				size: 0,
				error: { code: 404, message: "GitLab LFS object unavailable" },
			},
		],
		hash_algo: "sha256",
	});
});
test("exact requested object multiset rejects missing extra duplicate and changed size", () => {
	for (const upstream of [
		{ objects: [] },
		{
			objects: [
				{
					oid: otherOid,
					size: 0,
					actions: { download: { href: root + otherOid } },
				},
			],
		},
		{
			objects: [{ oid, size: 1, actions: { download: { href: root + oid } } }],
		},
		{
			objects: [
				{ oid, size: 0 },
				{ oid, size: 0 },
			],
		},
	])
		expect(() => rewrite(upstream)).toThrow();
	const input = {
		scope,
		batch: {
			operation: "upload",
			objects: [
				{ oid, size: 0 },
				{ oid, size: 0 },
			],
		},
		response: {
			objects: [
				{ oid, size: 0 },
				{ oid, size: 0 },
			],
		},
		organizationToken,
		now,
	};
	expect(rewriteGitlabLfsBatch(input).objects).toHaveLength(2);
});
test.each([
	{ download: { href: root + otherOid } },
	{
		download: {
			href: `https://gitlab.example.com/other/repo.git/gitlab-lfs/objects/${oid}`,
		},
	},
	{ download: { href: "https://gitlab.example.com/api/v4/user" } },
	{ download: { href: "http://objects.example.com/object" } },
	{ download: { href: "https://user:password@objects.example.com/object" } },
	{ download: { href: "https://objects.example.com:8443/object" } },
	{ download: { href: "https://127.0.0.1/object" } },
	{ download: { href: "https://objects.example.com/object#fragment" } },
	{ download: { href: "https://objects.example.com/../object" } },
	{ download: { href: "https://objects.example.com/%252e%252e/object" } },
	{ download: { href: "https://objects.example.com/\\object" } },
	{
		download: {
			href: root + oid,
			header: { Authorization: "one", authorization: "two" },
		},
	},
	{ download: { href: root + oid, header: { "X-Key": "one\r\ntwo" } } },
	{ download: { href: root + oid, header: { "X-Key": "x".repeat(5000) } } },
	{ download: { href: root + oid }, upload: { href: `${root + oid}/0` } },
	{ execute: { href: root + oid } },
	{},
])("rejects malformed or unsupported action metadata %#", (actions) =>
	expect(() => rewrite(response(actions))).toThrow());
test("operation negotiation and input objects remain bounded and exact", () => {
	for (const request of [
		{ operation: "execute", objects: [{ oid, size: 0 }] },
		{ operation: "download", objects: [{ oid, size: -1 }] },
		{
			operation: "download",
			objects: [{ oid, size: Number.MAX_SAFE_INTEGER + 1 }],
		},
		{ operation: "download", objects: [{ oid: "A".repeat(64), size: 0 }] },
		{ operation: "download", objects: [] },
		{
			operation: "download",
			transfers: ["custom"],
			objects: [{ oid, size: 0 }],
		},
	])
		expect(() =>
			rewriteGitlabLfsBatch({
				scope,
				batch: request,
				response: response({ download: { href: root + oid } }),
				organizationToken,
				now,
			}),
		).toThrow();
	for (const upstream of [
		{ ...response({ download: { href: root + oid } }), transfer: "custom" },
		{ ...response({ download: { href: root + oid } }), hash_algo: "sha512" },
		{
			objects: [
				{
					oid,
					size: 0,
					error: { code: 404, message: "error" },
					actions: { download: { href: root + oid } },
				},
			],
		},
	])
		expect(() => rewrite(upstream)).toThrow();
});
test("action expiry preserves shorter deadlines defaults to one hour and expires at the exact boundary", () => {
	const iso = new Date((now + 600) * 1000).toISOString().replace(".000Z", "Z");
	const path = actionPath(
		response({ download: { href: root + oid, expires_at: iso } }),
	);
	expect(readAction(path)).toMatchObject({ expiresAt: now + 600 });
	expect(() => readAction(path, "GET", undefined, scope, now + 600)).toThrow();
	expect(readAction(path, "GET", undefined, scope, now + 599)).toMatchObject({
		expiresAt: now + 600,
	});
	expect(
		readAction(
			actionPath(
				response({ download: { href: root + oid, expires_in: 7200 } }),
			),
		).expiresAt,
	).toBe(now + 3600);
	expect(
		readAction(
			actionPath(
				response({
					download: { href: root + oid, expires_in: 30, expires_at: "ignored" },
				}),
			),
		).expiresAt,
	).toBe(now + 30);
	for (const value of [
		{ expires_in: 0 },
		{ expires_in: -1 },
		{ expires_in: 0.5 },
		{ expires_in: Infinity },
		{ expires_at: "invalid" },
		{
			expires_at: new Date((now - 1) * 1000)
				.toISOString()
				.replace(".000Z", "Z"),
		},
	])
		expect(() =>
			rewrite(response({ download: { href: root + oid, ...value } })),
		).toThrow();
});
test("all tenant connection project and provider session identities bind authenticated ciphertext", () => {
	const path = actionPath(response({ download: { href: root + oid } }));
	for (const key of [
		"organizationId",
		"workspaceId",
		"connectionId",
		"providerTeamId",
		"providerProjectId",
		"sandboxId",
		"sandboxName",
		"projectPath",
		"origin",
	] as const) {
		expect(() =>
			readAction(path, "GET", undefined, {
				...scope,
				[key]: key === "origin" ? "https://foreign.example.com" : "foreign",
			}),
		).toThrow();
	}
	expect(() =>
		readAction(path, "GET", undefined, { ...scope, projectId: 43 }),
	).toThrow();
	for (const method of ["PUT", "POST", "HEAD", "get"])
		expect(() => readAction(path, method)).toThrow();
	expect(() => readAction(path, "GET", "owned-caller-body")).toThrow();
	expect(() => readAction(path, "GET", undefined, scope, now - 1)).toThrow();
});
test("ciphertext rejects mutations alternate encodings key changes and connector purpose", () => {
	const path = actionPath(response({ download: { href: root + oid } }));
	const ticket = path.slice("/.superset/lfs/".length);
	const mutated = (ticket[0] === "A" ? "B" : "A") + ticket.slice(1);
	for (const other of [
		`/.superset/lfs/${mutated}`,
		`${path}=`,
		`${path}?token=owned`,
		`${path}/extra`,
		path.replace("/.superset/", "/%2esuperset/"),
		`/.superset/lfs/${"a".repeat(16384)}`,
	])
		expect(() => readAction(other)).toThrow();
	expect(() =>
		open(
			Buffer.from(ticket, "base64url").toString("base64"),
			"connector:owned",
		),
	).toThrow();
	const connector = Buffer.from(
		seal("owned-connector-secret", "connector:owned"),
		"base64",
	).toString("base64url");
	expect(() => readAction(`/.superset/lfs/${connector}`)).toThrow();
	const saved = process.env.SECRETS_ENCRYPTION_KEY;
	process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 24).toString("base64");
	try {
		expect(() => readAction(path)).toThrow();
	} finally {
		process.env.SECRETS_ENCRYPTION_KEY = saved;
	}
});
test("capabilities remain within raw path limits even with private signed storage metadata", () => {
	const path = actionPath(
		response({
			download: {
				href: `https://objects.example.com/object?signature=${"s".repeat(3000)}`,
				header: { "x-storage-key": "h".repeat(2000) },
			},
		}),
	);
	expect(path.length).toBeLessThan(16384);
	expect(readAction(path).offHost).toBe(true);
	expect(() =>
		rewrite(
			response({
				download: { href: `https://objects.example.com/${"x".repeat(5000)}` },
			}),
		),
	).toThrow();
});
test("valid signed storage URLs at a root query survive without authority normalization", () => {
	const url = "https://objects.example.com?signature=OWNED_STORAGE_SIGNATURE";
	expect(
		readAction(actionPath(response({ download: { href: url } }))).url,
	).toBe(url);
	for (const href of [
		"https://objects.example.com\t/object",
		"https://objects.example.com@foreign.example.com/object",
		"https://%6fbjects.example.com/object",
		"https://objects.example.com./object",
	]) {
		expect(() => rewrite(response({ download: { href } }))).toThrow();
	}
});
test("expiry rejects calendar-invalid dates and unsafe offsets instead of Date.parse normalization", () => {
	for (const expires_at of [
		"2030-02-31T12:00:00Z",
		"2030-04-31T12:00:00Z",
		"2030-01-01T25:00:00Z",
		"2030-01-01T12:00:00+25:00",
		"2030-01-01T12:00:00.000Z",
		"2030-01-01t12:00:00z",
	]) {
		expect(() =>
			rewrite(response({ download: { href: root + oid, expires_at } })),
		).toThrow();
	}
});
test("missing or malformed existing encryption key fails closed without exposing action data", () => {
	const saved = process.env.SECRETS_ENCRYPTION_KEY;
	try {
		delete process.env.SECRETS_ENCRYPTION_KEY;
		expect(() =>
			rewrite(
				response({
					download: {
						href: root + oid,
						header: { Authorization: organizationToken },
					},
				}),
			),
		).toThrow("Invalid GitLab LFS action");
		process.env.SECRETS_ENCRYPTION_KEY = "bad";
		expect(() => rewrite(response({ download: { href: root + oid } }))).toThrow(
			"Invalid GitLab LFS action",
		);
	} finally {
		process.env.SECRETS_ENCRYPTION_KEY = saved;
	}
});
