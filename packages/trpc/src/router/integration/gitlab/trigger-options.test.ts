import { beforeEach, expect, mock, test } from "bun:test";
import { initTRPC, TRPCError } from "@trpc/server";

const organizationId = "21d0f441-245f-4769-a42b-00fa4b738b92";
const origin = "https://gitlab.example.test:8443";
const config = {
	provider: "gitlab" as const,
	host: "gitlab.example.test:8443",
	groupPath: "Team/Subgroup",
	scopeKind: "group" as const,
	scopeId: "7",
	auth: "token" as const,
	webhookSecret: "FAKE_SECRET",
};
const t = initTRPC
	.context<{ session: { user: { id: string } } | null }>()
	.create();
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
	return next({ ctx: { session: ctx.session } });
});
let authorized = true,
	connected = true,
	credentialsAvailable = true;
let status = 200;
let malformed = false;
let badProjectId = false;
let secondaryStatus = 200;
let credentialReads = 0;
const calls: string[] = [];
const projects = [
	{ id: 21, name: "Widget", path_with_namespace: "Team/Subgroup/Widget" },
	{ id: 22, name: "Other", path_with_namespace: "Team/Subgroup/Other" },
];
mock.module("../../../trpc", () => ({ protectedProcedure }));
mock.module("../utils", () => ({
	verifyOrgMembership: async (userId: string, org: string) => {
		expect([userId, org]).toEqual(["viewer", organizationId]);
		if (!authorized) throw new TRPCError({ code: "FORBIDDEN" });
	},
}));
mock.module("../../../lib/gitlab/connection", () => ({
	gitlabConnectionForOrg: async (org: string) => {
		expect(org).toBe(organizationId);
		return connected ? { id: "connection" } : null;
	},
	gitlabCredentialsFor: async (id: string, options: unknown) => {
		expect(id).toBe("connection");
		credentialReads++;
		expect(options).toMatchObject({ organizationId });
		return credentialsAvailable
			? { connectionId: id, organizationId, config, token: "FAKE_TOKEN" }
			: null;
	},
}));
mock.module("../../../lib/gitlab/transport", () => ({
	safeGitLabFetch: async (input: string | URL, init: RequestInit) => {
		const url = new URL(input);
		expect(url.origin).toBe(origin);
		expect(new Headers(init.headers).get("Authorization")).toBe(
			"Bearer FAKE_TOKEN",
		);
		calls.push(url.pathname + url.search);
		if (status !== 200) return new Response("", { status });
		if (secondaryStatus !== 200 && url.pathname.includes("/projects/"))
			return new Response("", { status: secondaryStatus });
		const page = url.searchParams.get("page");
		const second = page === "2";
		const data =
			url.pathname === "/api/v4/groups/7/projects"
				? [{ ...projects[second ? 1 : 0], ...(badProjectId ? { id: 0 } : {}) }]
				: url.pathname.endsWith("/labels")
					? [{ name: second ? "bug" : "ready" }]
					: [{ name: second ? "main" : "Feature" }];
		return Response.json(malformed ? { data } : data, {
			headers: { "x-next-page": second ? "" : "2" },
		});
	},
}));
for (const source of [
	"github",
	"google",
	"linear",
	"microsoft-teams",
	"notion",
	"sentry",
	"slack",
]) {
	const moduleName = `../${source}/trigger-options`;
	const exportName =
		source === "microsoft-teams"
			? "microsoftTeamsTriggerOptions"
			: `${source}TriggerOptions`;
	mock.module(moduleName, () => ({
		[exportName]: {
			repositories: async () => [{ id: "123", label: "Original GitHub" }],
		},
	}));
}
const { triggerOptionsRouter } = await import("../trigger-options");
const router = t.router(triggerOptionsRouter);
const caller = () =>
	router.createCaller({ session: { user: { id: "viewer" } } });
beforeEach(() => {
	authorized = connected = credentialsAvailable = true;
	status = 200;
	malformed = badProjectId = false;
	secondaryStatus = 200;
	credentialReads = 0;
	calls.length = 0;
});

test("native option group accepts current scoped projects, branches and labels", async () => {
	const options = await caller().triggerOptions({
		organizationId,
		group: "gitlab",
	});
	expect(options.projects).toEqual([
		{ id: "Team/Subgroup/Widget", label: "Widget", hint: "Team/Subgroup" },
		{ id: "Team/Subgroup/Other", label: "Other", hint: "Team/Subgroup" },
	]);
	expect(options.branches).toEqual([
		{ id: "Feature", label: "Feature" },
		{ id: "main", label: "main" },
	]);
	expect(options.labels).toEqual([
		{ id: "bug", label: "bug" },
		{ id: "ready", label: "ready" },
	]);
	expect(calls.some((path) => path.includes("page=2"))).toBe(true);
	expect(credentialReads).toBe(1);
	expect(
		calls.filter((path) => path.startsWith("/api/v4/groups/7/projects")),
	).toHaveLength(2);
});

test("the original GitHub option group keeps its output", async () => {
	expect(
		await caller().triggerOptions({ organizationId, group: "github" }),
	).toEqual({ repositories: [{ id: "123", label: "Original GitHub" }] });
	expect(calls).toEqual([]);
});

test("nonmembers cannot reach native credentials or provider endpoints", async () => {
	authorized = false;
	await expect(
		caller().triggerOptions({ organizationId, group: "gitlab" }),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(credentialReads).toBe(0);
	expect(calls).toEqual([]);
});

test("anonymous native option requests retain the protected boundary", async () => {
	await expect(
		router
			.createCaller({ session: null })
			.triggerOptions({ organizationId, group: "gitlab" }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(credentialReads).toBe(0);
});

test("a disconnected org has empty options without provider requests", async () => {
	connected = false;
	expect(
		await caller().triggerOptions({ organizationId, group: "gitlab" }),
	).toEqual({ projects: [], branches: [], labels: [] });
	expect(credentialReads).toBe(0);
	expect(calls).toEqual([]);
});

test("expired native credentials require reconnect instead of empty options", async () => {
	credentialsAvailable = false;
	await expect(
		caller().triggerOptions({ organizationId, group: "gitlab" }),
	).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	expect(calls).toEqual([]);
});

for (const [refusedStatus, code] of [
	[401, "PRECONDITION_FAILED"],
	[403, "FORBIDDEN"],
	[429, "TOO_MANY_REQUESTS"],
	[503, "BAD_GATEWAY"],
] as const) {
	for (const secondary of [false, true]) {
		test(`native ${secondary ? "secondary options" : "projects"} ${refusedStatus} remains a visible failure`, async () => {
			if (secondary) secondaryStatus = refusedStatus;
			else status = refusedStatus;
			await expect(
				caller().triggerOptions({ organizationId, group: "gitlab" }),
			).rejects.toMatchObject({ code, cause: { status: refusedStatus } });
		});
	}
}

test("malformed native list responses are rejected rather than reported as empty", async () => {
	malformed = true;
	await expect(
		caller().triggerOptions({ organizationId, group: "gitlab" }),
	).rejects.toThrow("Invalid GitLab list response");
});

test("invalid project IDs never reach branch or label endpoints", async () => {
	badProjectId = true;
	await expect(
		caller().triggerOptions({ organizationId, group: "gitlab" }),
	).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	expect(
		calls.every((path) => path.startsWith("/api/v4/groups/7/projects")),
	).toBe(true);
});

test("native outage recovery reads a fresh request snapshot", async () => {
	status = 503;
	await expect(
		caller().triggerOptions({ organizationId, group: "gitlab" }),
	).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	status = 200;
	const result = await caller().triggerOptions({
		organizationId,
		group: "gitlab",
	});
	expect(result.projects).toHaveLength(2);
	expect(credentialReads).toBe(2);
});
