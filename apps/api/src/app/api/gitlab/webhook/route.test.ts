import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { GitLabConfig } from "@superset/db/schema";

const connectionId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const deliveryId = "33333333-3333-4333-8333-333333333333";
const state: GitLabConfig = {
	provider: "gitlab",
	host: "gitlab.example.test:8443",
	groupPath: "team/widget",
	auth: "token",
	webhookSecret: "fixture-business-secret",
	scopeKind: "project",
	scopeId: "7",
};
function connection() {
	return {
		id: connectionId,
		organizationId,
		connector: "gitlab",
		ownerKind: "org",
		connectedByUserId: "44444444-4444-4444-8444-444444444444",
		authMethod: "token",
		accessToken: "fake-ciphertext",
		refreshToken: null,
		tokenExpiresAt: null,
		config: null,
		state: structuredClone(state),
		issuer: null,
		resource: null,
		externalAccountId: "team/widget",
		externalUserId: null,
		disconnectedAt: null as Date | null,
		updatedAt: new Date("2026-10-04T00:00:00Z"),
	};
}
let row: ReturnType<typeof connection> | undefined = connection();
let lookups = 0,
	locks = 0,
	rowLock = "",
	inTransaction = false,
	committed = false,
	duplicate = false,
	recordFails = false,
	commitFails = false,
	dispatchFails = false;
let beforeLock: (() => void) | undefined;
const records: Record<string, unknown>[] = [],
	publications: Record<string, unknown>[] = [];
const tx = {
	select: () => {
		const query = {
			from: () => query,
			where: () => query,
			limit: () => query,
			for: async (strength: string) => {
				rowLock = strength;
				return row ? [structuredClone(row)] : [];
			},
		};
		return query;
	},
	insert: () => ({
		values: (values: Record<string, unknown>) => ({
			onConflictDoNothing: () => ({
				returning: async () => {
					if (!inTransaction || rowLock !== "share")
						throw Error("record missing guarded row transaction");
					if (recordFails) throw Error("fixture insert failure");
					if (duplicate) return [];
					records.push(values);
					return [{ id: "event-1" }];
				},
			}),
		}),
	}),
};
mock.module("@superset/db/client", () => ({
	db: {
		query: {
			connections: {
				findFirst: async () => {
					lookups++;
					return row ? structuredClone(row) : undefined;
				},
			},
		},
	},
}));
mock.module("@superset/db/utils", () => ({
	withConnectionLock: async (
		id: string,
		callback: (value: typeof tx) => Promise<unknown>,
	) => {
		if (id !== connectionId) throw Error("wrong lock key");
		locks++;
		beforeLock?.();
		inTransaction = true;
		try {
			const result = await callback(tx);
			if (commitFails) {
				records.length = 0;
				throw Error("fixture commit failure");
			}
			committed = true;
			return result;
		} finally {
			inTransaction = false;
		}
	},
}));
mock.module("@/lib/automations/dispatchMatchingTriggers", () => ({
	dispatchMatchingTriggers: async (value: Record<string, unknown>) => {
		if (inTransaction || !committed) throw Error("publication preceded commit");
		if (dispatchFails) throw Error("fixture queue failure");
		publications.push(value);
		return { matched: 1, considered: 2 };
	},
}));
let enrichmentAvailable = false;
let enrichmentFails = false;
let afterProviderRead: (() => void) | undefined;
const providerCalls: string[] = [];
mock.module("@superset/trpc/lib/gitlab/connection", () => ({
	gitlabCredentialsFor: async (
		id: string,
		options: {
			organizationId: string;
			expected: { host: string; projectPath: string };
		},
	) => {
		expect(inTransaction).toBe(false);
		providerCalls.push("credentials");
		expect(id).toBe(connectionId);
		expect(options).toEqual({
			organizationId,
			expected: { host: state.host, projectPath: "team/widget" },
		});
		if (enrichmentFails) throw new Error("fixture credential failure");
		return enrichmentAvailable
			? {
					connectionId,
					organizationId,
					token: "FAKE_SELECTED_TOKEN",
					config: structuredClone(state),
				}
			: null;
	},
}));
mock.module("@superset/trpc/lib/gitlab/transport", () => ({
	safeGitLabFetch: async (value: string | URL, init: RequestInit = {}) => {
		expect(inTransaction).toBe(false);
		const url = new URL(value);
		expect(url.origin).toBe("https://gitlab.example.test:8443");
		expect(new Headers(init.headers).get("authorization")).toBe(
			"Bearer FAKE_SELECTED_TOKEN",
		);
		providerCalls.push(url.pathname);
		if (url.pathname === "/api/v4/projects/team%2Fwidget")
			return Response.json({
				id: 7,
				path_with_namespace: "team/widget",
				http_url_to_repo: "https://gitlab.example.test:8443/team/widget.git",
				default_branch: "main",
			});
		if (url.pathname === "/api/graphql") {
			const query = JSON.parse(String(init.body));
			const id = Number(query.variables.pipelineId.split("/").at(-1));
			expect([29, 30]).toContain(id);
			afterProviderRead?.();
			return Response.json({
				data: {
					project: {
						id: "gid://gitlab/Project/7",
						fullPath: "team/widget",
						pipeline: {
							id: `gid://gitlab/Ci::Pipeline/${id}`,
							source: id === 30 ? "parent_pipeline" : "push",
							ref: "Feature",
							sha: "a".repeat(40),
							project: {
								id: "gid://gitlab/Project/7",
								fullPath: "team/widget",
							},
							mergeRequest: null,
							upstream:
								id === 30 ? { id: "gid://gitlab/Ci::Pipeline/29" } : null,
						},
					},
				},
			});
		}
		throw new Error("Unexpected fake provider endpoint");
	},
}));
const { POST: handler } = await import("./route");
const payload = {
	object_kind: "merge_request",
	project: {
		id: 7,
		path_with_namespace: "team/widget",
		web_url: "https://gitlab.example.test:8443/team/widget",
	},
	user: { id: 1, username: "fixture-user" },
	object_attributes: {
		id: 77,
		iid: 3,
		action: "open",
		title: "Fixture MR",
		url: "https://gitlab.example.test:8443/team/widget/-/merge_requests/3",
		source_branch: "Feature",
		target_branch: "main",
		source_project_id: 7,
		target_project_id: 7,
	},
	labels: [],
};
function request(
	body: string | ReadableStream<Uint8Array> = JSON.stringify(payload),
	headers: Record<string, string> = {},
	query = `connection=${connectionId}`,
) {
	return new Request(`https://api.example.test/api/gitlab/webhook?${query}`, {
		method: "POST",
		body,
		headers: {
			"x-gitlab-token": state.webhookSecret,
			"x-gitlab-event-uuid": deliveryId,
			...headers,
		},
	});
}
afterEach(() => {
	row = connection();
	lookups = 0;
	locks = 0;
	rowLock = "";
	inTransaction = false;
	committed = false;
	duplicate = false;
	recordFails = false;
	commitFails = false;
	dispatchFails = false;
	beforeLock = undefined;
	records.length = 0;
	publications.length = 0;
	enrichmentAvailable = false;
	enrichmentFails = false;
	afterProviderRead = undefined;
	providerCalls.length = 0;
});

test("selected organization delivery records under row share and publishes only after commit", async () => {
	const response = await handler(request());
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		status: "dispatched",
		eventId: "event-1",
		matched: 1,
		considered: 2,
	});
	expect(records).toHaveLength(1);
	expect(records[0]).toMatchObject({
		organizationId,
		integrationConnectionId: connectionId,
		provider: "gitlab",
		externalEventId: deliveryId,
	});
	expect(publications).toHaveLength(1);
	expect(locks).toBe(1);
	expect(rowLock).toBe("share");
});
test.each([
	"",
	"wrong",
	"666978747572652d627573696e6573732d736563726574",
])("wrong or empty business secret refused before body: %s", async (token) => {
	let read = false;
	const stream = new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				read = true;
				controller.close();
			},
		},
		{ highWaterMark: 0 },
	);
	expect(
		(await handler(request(stream, { "x-gitlab-token": token }))).status,
	).toBe(401);
	expect(read).toBe(false);
	expect(locks).toBe(0);
	expect(records).toHaveLength(0);
});
test.each([
	"connector",
	"ownerKind",
	"disconnectedAt",
	"state",
])("foreign or inactive row refused before ingestion: %s", async (field) => {
	if (!row) throw Error("missing row");
	if (field === "connector") row.connector = "github";
	if (field === "ownerKind") row.ownerKind = "user";
	if (field === "disconnectedAt") row.disconnectedAt = new Date();
	if (field === "state") Object.assign(row.state, { provider: "github" });
	expect((await handler(request())).status).toBe(401);
	expect(records).toHaveLength(0);
	expect(publications).toHaveLength(0);
});
test.each([
	"",
	"bad",
	`${connectionId}&connection=${connectionId}`,
])("missing malformed or duplicate connection refused without lookup: %s", async (value) => {
	expect(
		(await handler(request("{}", {}, value ? `connection=${value}` : "")))
			.status,
	).toBe(401);
	expect(lookups).toBe(0);
});
test.each([
	"",
	" ",
	"id,id",
	"x".repeat(129),
])("invalid delivery header never becomes dedupe key: %s", async (id) => {
	expect(
		(await handler(request(undefined, { "x-gitlab-event-uuid": id }))).status,
	).toBe(400);
	expect(records).toHaveLength(0);
});
test("bounded released opaque ID is preserved exactly", async () => {
	expect(
		(
			await handler(
				request(undefined, { "x-gitlab-event-uuid": "legacy-delivery_42" }),
			)
		).status,
	).toBe(200);
	expect(records[0]?.externalEventId).toBe("legacy-delivery_42");
});
test("absent header gets fresh server UUID", async () => {
	const input = request();
	input.headers.delete("x-gitlab-event-uuid");
	expect((await handler(input)).status).toBe(200);
	expect(records[0]?.externalEventId).toMatch(/^[0-9a-f-]{36}$/);
});
test.each([
	"{",
	"null",
	"[]",
	'{"object_kind":7}',
])("invalid JSON/schema never records: %s", async (body) => {
	expect((await handler(request(body))).status).toBe(400);
	expect(records).toHaveLength(0);
	expect(publications).toHaveLength(0);
});
test("announced and streamed oversize rejected outside connection lock", async () => {
	expect(
		(await handler(request("{}", { "content-length": "1048577" }))).status,
	).toBe(413);
	expect((await handler(request("x".repeat(1048577)))).status).toBe(413);
	expect(locks).toBe(0);
	expect(records).toHaveLength(0);
});
test.each([
	"team/other",
	"team/widget-extra",
])("foreign project refused without record: %s", async (path) => {
	const input = {
		...payload,
		project: {
			...payload.project,
			path_with_namespace: path,
			web_url: `https://gitlab.example.test:8443/${path}`,
		},
	};
	expect((await handler(request(JSON.stringify(input)))).status).toBe(403);
	expect(records).toHaveLength(0);
});
test("matching path cannot override project ID", async () => {
	expect(
		(
			await handler(
				request(
					JSON.stringify({
						...payload,
						project: { ...payload.project, id: 8 },
					}),
				),
			)
		).status,
	).toBe(403);
	expect(records).toHaveLength(0);
});
test("matching path cannot override instance", async () => {
	expect(
		(
			await handler(
				request(
					JSON.stringify({
						...payload,
						project: {
							...payload.project,
							web_url: "https://other.example.test/team/widget",
						},
					}),
				),
			)
		).status,
	).toBe(403);
	expect(records).toHaveLength(0);
});
test.each([
	"organization",
	"provider",
	"owner",
	"secret",
	"rawState",
	"disconnect",
])("lock-wait generation change refuses stale delivery: %s", async (change) => {
	beforeLock = () => {
		if (!row) throw Error("missing row");
		if (change === "organization")
			row.organizationId = "55555555-5555-4555-8555-555555555555";
		if (change === "provider") row.connector = "github";
		if (change === "owner") row.ownerKind = "user";
		if (change === "secret") row.state.webhookSecret = "new-business-secret";
		if (change === "rawState") Object.assign(row.state, { ordinaryEdit: true });
		if (change === "disconnect") row.disconnectedAt = new Date();
	};
	expect((await handler(request())).status).toBe(401);
	expect(records).toHaveLength(0);
	expect(publications).toHaveLength(0);
});
test("changed business secret during stalled body cannot commit old authentication", async () => {
	let release!: () => void, waiting!: () => void;
	const started = new Promise<void>((resolve) => {
		waiting = resolve;
	});
	const stream = new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				waiting();
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
				controller.close();
			},
		},
		{ highWaterMark: 0 },
	);
	const pending = handler(request(stream));
	await started;
	if (!row) throw Error("missing row");
	row.state.webhookSecret = "new-reconnect-business-secret";
	release();
	expect((await pending).status).toBe(401);
	expect(records).toHaveLength(0);
	expect(publications).toHaveLength(0);
});
test("upstream duplicate records and publishes nothing", async () => {
	duplicate = true;
	expect(await (await handler(request())).json()).toEqual({
		status: "duplicate",
	});
	expect(records).toHaveLength(0);
	expect(publications).toHaveLength(0);
});
test.each([
	"record",
	"commit",
])("transaction failure never publishes: %s", async (failure) => {
	recordFails = failure === "record";
	commitFails = failure === "commit";
	await expect(handler(request())).rejects.toThrow(
		`fixture ${failure === "record" ? "insert" : "commit"} failure`,
	);
	expect(publications).toHaveLength(0);
});
test("failed publication acknowledges durable unmarked event for redispatch", async () => {
	dispatchFails = true;
	const logging = spyOn(console, "error").mockImplementation(() => {});
	try {
		const response = await handler(request());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "dispatch_failed",
			eventId: "event-1",
		});
		expect(records[0]?.dispatchedAt).toBeNull();
	} finally {
		logging.mockRestore();
	}
});
test("group-scoped connection accepts a descendant project without treating group ID as project ID", async () => {
	if (!row) throw Error("missing row");
	Object.assign(row.state, {
		groupPath: "team",
		scopeKind: "group",
		scopeId: "99",
	});
	expect((await handler(request())).status).toBe(200);
	expect(records[0]?.organizationId).toBe(organizationId);
	expect(publications).toHaveLength(1);
});
test("missing MR ancestry remains recorded-only without sending an unsafe trigger", async () => {
	const input = {
		...payload,
		object_attributes: {
			...payload.object_attributes,
			source_project_id: null,
			target_project_id: null,
		},
	};
	expect(await (await handler(request(JSON.stringify(input)))).json()).toEqual({
		status: "recorded",
		eventId: "event-1",
	});
	expect(records).toHaveLength(1);
	expect(records[0]?.dispatchInput).toBeNull();
	expect(records[0]?.dispatchedAt).toBeInstanceOf(Date);
	expect(publications).toHaveLength(0);
});
test("permanent conflicting identity skip records and publishes nothing", async () => {
	expect(
		await (
			await handler(request(JSON.stringify({ ...payload, project_id: 8 })))
		).json(),
	).toEqual({
		status: "skipped",
		reason: "GitLab delivery has conflicting project identity",
	});
	expect(records).toHaveLength(0);
	expect(publications).toHaveLength(0);
});

test.each([
	"accessToken",
	"refreshPair",
	"expiry",
	"metadata",
	"rawConfig",
])("unchanged webhook grant accepts legitimate credential or metadata rotation during lock wait: %s", async (change) => {
	beforeLock = () => {
		if (!row) throw Error("missing row");
		if (change === "accessToken") row.accessToken = "refreshed-api-token";
		if (change === "refreshPair")
			Object.assign(row, {
				accessToken: "refreshed-api-token",
				refreshToken: "refreshed-api-grant",
			});
		if (change === "expiry")
			Object.assign(row, { tokenExpiresAt: new Date(), updatedAt: new Date() });
		if (change === "metadata")
			Object.assign(row, {
				issuer: "https://gitlab.example.test:8443",
				resource: "metadata",
				externalAccountLabel: "Changed label",
				connectedByUserId: "55555555-5555-4555-8555-555555555555",
				updatedAt: new Date(),
			});
		if (change === "rawConfig")
			Object.assign(row, { config: { ordinaryMetadata: "edited" } });
	};
	const response = await handler(request());
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		status: "dispatched",
		eventId: "event-1",
		matched: 1,
		considered: 2,
	});
	expect(records).toHaveLength(1);
});
test("official MR source and target project objects reach the real authenticated webhook ingestion path", async () => {
	const project = {
		id: 7,
		name: "widget",
		path_with_namespace: "team/widget",
		web_url: "https://gitlab.example.test:8443/team/widget",
		namespace: "team",
		homepage: "https://gitlab.example.test:8443/team/widget",
		git_http_url: "https://gitlab.example.test:8443/team/widget.git",
		git_ssh_url: "git@gitlab.example.test:team/widget.git",
		default_branch: "main",
	};
	const full = {
		...payload,
		project,
		object_attributes: {
			...payload.object_attributes,
			source: project,
			target: project,
			last_commit: {
				id: "fixture-commit",
				message: "Fixture change",
				author: { name: "Fixture", email: "fixture@example.invalid" },
			},
		},
	};
	const response = await handler(request(JSON.stringify(full)));
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		status: "dispatched",
		eventId: "event-1",
		matched: 1,
		considered: 2,
	});
	expect(records).toHaveLength(1);
	expect(publications).toHaveLength(1);
});

function childPipeline(sha = "a".repeat(40)) {
	return {
		object_kind: "pipeline",
		project: payload.project,
		object_attributes: {
			id: 30,
			source: "parent_pipeline",
			status: "success",
			ref: "Feature",
			sha,
		},
	};
}
test("authenticated child pipeline enriches outside the lock and publishes proven ancestry after commit", async () => {
	enrichmentAvailable = true;
	const response = await handler(request(JSON.stringify(childPipeline())));
	expect(await response.json()).toMatchObject({
		status: "dispatched",
		eventId: "event-1",
	});
	expect(providerCalls).toEqual([
		"credentials",
		"/api/v4/projects/team%2Fwidget",
		"/api/graphql",
		"/api/graphql",
	]);
	expect(records[0]?.payload).toMatchObject({
		pipeline: {
			id: "30",
			ids: ["30", "29"],
			rootSource: "push",
			sha: "a".repeat(40),
		},
	});
	expect(publications).toHaveLength(1);
	expect(rowLock).toBe("share");
});
test("raw original pipeline hash contradiction stays recorded-only", async () => {
	enrichmentAvailable = true;
	const response = await handler(
		request(JSON.stringify(childPipeline("b".repeat(40)))),
	);
	expect(await response.json()).toMatchObject({ status: "recorded" });
	expect(providerCalls).toHaveLength(4);
	expect(records[0]?.dispatchInput).toBeNull();
	expect(publications).toHaveLength(0);
});
test("changed business secret during metadata read cannot persist old delivery", async () => {
	enrichmentAvailable = true;
	afterProviderRead = () => {
		if (!row) throw Error("missing row");
		row.state.webhookSecret = "reconnected-business-secret";
	};
	expect((await handler(request(JSON.stringify(childPipeline())))).status).toBe(
		401,
	);
	expect(providerCalls).toHaveLength(4);
	expect(records).toHaveLength(0);
	expect(publications).toHaveLength(0);
});
test("metadata credential failure cannot acknowledge or record a delivery", async () => {
	enrichmentAvailable = true;
	enrichmentFails = true;
	await expect(
		handler(request(JSON.stringify(childPipeline()))),
	).rejects.toThrow("fixture credential failure");
	expect(locks).toBe(0);
	expect(records).toHaveLength(0);
	expect(publications).toHaveLength(0);
});
test("ordinary complete delivery retains no-provider ingestion", async () => {
	enrichmentAvailable = true;
	expect((await handler(request())).status).toBe(200);
	expect(providerCalls).toEqual([]);
	expect(publications).toHaveLength(1);
});
