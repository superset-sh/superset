import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// A refresh is a token-endpoint call plus what gets written back, so the
// endpoint and the update are the two things stubbed here. `mock.module` is
// process-wide, so each stub lists every export the real module has.
//
// The lookup rule lives here too rather than in its own file: these stubs are
// stateful, and a second file stubbing the same modules would both lose the
// race for whichever registration bun pins and leave its own `rows` binding
// unread by the pinned closure.
//
// `./index`, `./client-identity` and the manifest module are deliberately NOT
// stubbed: a partial stub of any of them pins process-wide and breaks every
// other file that imports the rest. A real registry connector with a static
// client is used instead, so `resolveEndpoints` runs for real and reaches no
// network, and the token endpoint is intercepted at `globalThis.fetch` — the
// same seam `connectors.test.ts` uses.

let rows: Array<Record<string, unknown>> = [];
let stored: Record<string, unknown> | null = null;
let updates: Array<Record<string, unknown>> = [];
let response: { status: number; ok: boolean; body: unknown } | null = null;
let fetchError: Error | null = null;

let limits: number[] = [];

// `refresh` re-reads one row by id; the lookups read two to detect a second.
const selectChain = {
	from: () => selectChain,
	where: () => selectChain,
	orderBy: () => selectChain,
	limit: (n: number) => {
		limits.push(n);
		if (rows.length) return Promise.resolve(rows.slice(0, n));
		return Promise.resolve(stored ? [stored] : []);
	},
};

// `where()` is both awaited directly and chained into `returning()`, so it
// answers a real promise carrying that method rather than a hand-rolled
// thenable.
const updateResult = Object.assign(Promise.resolve(undefined), {
	returning: () => Promise.resolve([stored]),
});

const updateChain = {
	set: (values: Record<string, unknown>) => {
		updates.push(values);
		return updateChain;
	},
	where: () => updateResult,
};

mock.module("@superset/db/client", () => ({
	db: {
		select: () => selectChain,
		update: () => updateChain,
		query: {},
	},
	dbWs: {
		transaction: () => Promise.reject(new Error("dbWs is stubbed in tests")),
	},
}));

mock.module("../../router/plugins/crypto", () => ({
	decryptSecret: (value: string) => Promise.resolve(value),
	decryptOptional: (value: string | null) => Promise.resolve(value),
	encryptSecret: (value: string) => Promise.resolve(value),
	encryptOptional: (value: string | null) => Promise.resolve(value),
}));

const {
	ConnectorUnavailableError,
	ensureFreshConnection,
	NEEDS_REAUTH,
	UnrefreshableConnectionError,
} = await import("./refresh");
const { AmbiguousConnectionError, orgConnection, userConnection } =
	await import("./lookup");

const CONNECTOR = "linear";
const ENV = { LINEAR_CLIENT_ID: "id", LINEAR_CLIENT_SECRET: "secret" };
const original: Record<string, string | undefined> = {};
for (const [key, value] of Object.entries(ENV)) {
	original[key] = process.env[key];
	process.env[key] = value;
}
afterAll(() => {
	for (const key of Object.keys(ENV)) {
		if (original[key] === undefined) delete process.env[key];
		else process.env[key] = original[key];
	}
});

const EXPIRED = new Date(Date.now() - 60_000);

function connection(overrides: Record<string, unknown> = {}) {
	return {
		id: "conn-1",
		connector: CONNECTOR,
		authMethod: "oauth2",
		accessToken: "old-access",
		refreshToken: "refresh",
		tokenExpiresAt: EXPIRED,
		config: null,
		...overrides,
	} as never;
}

const realFetch = globalThis.fetch;
afterAll(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	updates = [];
	limits = [];
	rows = [];
	response = null;
	fetchError = null;
	stored = connection();
	globalThis.fetch = (async () => {
		if (fetchError) throw fetchError;
		const current = response;
		if (!current) throw new Error("no token-endpoint response configured");
		return new Response(JSON.stringify(current.body), {
			status: current.status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
});

describe("a connection that cannot be refreshed", () => {
	test("is recorded as needing reauthorization, not only thrown", async () => {
		stored = connection({ refreshToken: null });

		await expect(
			ensureFreshConnection(connection({ refreshToken: null })),
		).rejects.toBeInstanceOf(UnrefreshableConnectionError);

		// Without this write the row still reads as connected everywhere.
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject({ disconnectReason: NEEDS_REAUTH });
		expect(updates[0]?.disconnectedAt).toBeInstanceOf(Date);
	});

	test("a rejected refresh token is recorded the same way", async () => {
		response = { ok: false, status: 400, body: { error: "invalid_grant" } };

		await expect(ensureFreshConnection(connection())).rejects.toBeInstanceOf(
			UnrefreshableConnectionError,
		);
		expect(updates[0]).toMatchObject({ disconnectReason: NEEDS_REAUTH });
	});
});

describe("a token endpoint that is merely down", () => {
	test("does not disconnect the connection", async () => {
		response = { ok: false, status: 503, body: {} };

		await expect(ensureFreshConnection(connection())).rejects.toBeInstanceOf(
			ConnectorUnavailableError,
		);
		// Someone else's outage must not cost the user their connection.
		expect(updates).toHaveLength(0);
	});

	test("an unreachable endpoint is unavailable, not unrefreshable", async () => {
		fetchError = new Error("ECONNREFUSED");

		const error = await ensureFreshConnection(connection()).catch((e) => e);
		expect(error).toBeInstanceOf(ConnectorUnavailableError);
		expect(updates).toHaveLength(0);
	});
});

describe("a connection that is still valid", () => {
	test("is returned without calling the token endpoint", async () => {
		const fresh = connection({
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});
		await expect(ensureFreshConnection(fresh)).resolves.toBe(fresh);
		expect(updates).toHaveLength(0);
	});
});

describe("one account, or an error", () => {
	test("a single match resolves", async () => {
		rows = [{ id: "conn-1" }];
		await expect(
			userConnection("org", "linear", "user"),
		).resolves.toMatchObject({ id: "conn-1" });
	});

	test("two live rows throw rather than resolving to the newest", async () => {
		rows = [{ id: "conn-newer" }, { id: "conn-older" }];
		const error = await userConnection("org", "linear", "user").catch((e) => e);
		expect(error).toBeInstanceOf(AmbiguousConnectionError);
		expect(error.connector).toBe("linear");
		expect(error.connectionIds).toEqual(["conn-newer", "conn-older"]);
	});

	test("the org lookup is ambiguous on the same terms", async () => {
		rows = [{ id: "a" }, { id: "b" }];
		await expect(orgConnection("org", "slack")).rejects.toBeInstanceOf(
			AmbiguousConnectionError,
		);
	});

	test("a second row is read, so a second row can be seen at all", async () => {
		rows = [{ id: "conn-1" }];
		await userConnection("org", "linear", "user");
		expect(limits).toEqual([2]);
	});
});
