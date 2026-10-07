import { beforeEach, expect, mock, test } from "bun:test";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DispatchableAutomation } from "./dispatch";

let payload: Record<string, unknown>,
	provider = "gitlab",
	repositoryId: string | null = "7",
	eventOrg = "org",
	projectOrg = "org",
	createFailure: "refused" | "transport" | null = null,
	cloneUrl = "https://gitlab.example.test:8443/Team/Widget.git";
const eventQueries: Array<{ columns: Record<string, boolean>; where: SQL }> =
	[];
class RefusedCheckout extends Error {}
const mutations: Array<{ procedure: string; input: Record<string, unknown> }> =
		[],
	selections: string[] = [],
	runs: Record<string, unknown>[] = [];
const automation: DispatchableAutomation = {
	id: "automation",
	name: "Review",
	organizationId: "org",
	ownerUserId: "user",
	agent: "agent",
	prompt: "review this",
	targetHostId: "host",
	v2ProjectId: "project",
	v2WorkspaceId: null,
	cloudWorkspaceId: null,
	environmentId: null,
	tags: [],
	continueAgentSession: false,
};
mock.module("@superset/auth/server", () => ({
	mintUserJwt: async () => "FAKE_JWT",
}));
mock.module("../../env", () => ({ env: {} }));
mock.module("../../lib/realtime", () => ({ nudge: () => {} }));
mock.module("../../lib/relay-presence", () => ({
	fetchRelayPresence: async () => ({
		[buildHostRoutingKey("org", "host")]: { online: true },
	}),
}));
mock.module("../../lib/sandbox", () => ({
	SandboxNotReadyError: class extends Error {},
}));
mock.module("./cloudDispatch", () => ({ runInCloud: async () => null }));
mock.module("./relay-client", () => ({
	RelayDispatchError: RefusedCheckout,
	relayMutation: async (
		_transport: unknown,
		procedure: string,
		input: Record<string, unknown>,
	) => {
		mutations.push({ procedure, input });
		if (procedure === "workspaces.create" && input.pr && createFailure)
			throw createFailure === "refused"
				? new RefusedCheckout("FAKE_REFUSED")
				: Error("FAKE_TRANSPORT_TIMEOUT");
		return procedure === "workspaces.create"
			? { workspace: { id: "workspace" } }
			: { kind: "terminal", sessionId: "session", label: "agent" };
	},
}));
mock.module("@superset/db/client", () => ({
	db: {
		query: {
			automationEvents: {
				findFirst: async (options: {
					columns: Record<string, boolean>;
					where: SQL;
				}) => {
					eventQueries.push(options);
					return {
						provider,
						repositoryId,
						payload,
						organizationId: eventOrg,
						integrationConnectionId: "connection",
						eventType: "merge_request.opened",
						title: "MR",
						url: null,
						actorLogin: "actor",
						ref: "Feature",
						receivedAt: new Date(),
					};
				},
			},
		},
		select: () => {
			let table = "";
			const query = {
				from: (value: Parameters<typeof getTableName>[0]) => {
					table = getTableName(value);
					selections.push(table);
					return query;
				},
				where: () => query,
				limit: async () =>
					table === "v2_hosts"
						? [{ organizationId: "org", machineId: "host" }]
						: table === "v2_projects"
							? [{ repoCloneUrl: cloneUrl, organizationId: projectOrg }]
							: table === "github_repositories"
								? [{ fullName: "Team/Widget" }]
								: [],
			};
			return query;
		},
		insert: () => ({
			values: (value: Record<string, unknown>) => ({
				onConflictDoNothing: () => ({
					returning: async () => {
						runs.push(value);
						return [{ id: "run" }];
					},
				}),
			}),
		}),
		update: () => ({
			set: (value: Record<string, unknown>) => ({
				where: async () => {
					runs.push(value);
				},
			}),
		}),
	},
}));
const { dispatchAutomation } = await import("./dispatch");
beforeEach(() => {
	payload = {
		host: "gitlab.example.test:8443",
		projectPath: "Team/Widget",
		repositoryId: "7",
		iid: 12,
		fork: false,
		sourceProjectId: "7",
		targetProjectId: "7",
		objectKind: "merge_request",
		noteableType: null,
	};
	provider = "gitlab";
	repositoryId = "7";
	eventOrg = "org";
	projectOrg = "org";
	createFailure = null;
	eventQueries.length = 0;
	cloneUrl = "https://gitlab.example.test:8443/Team/Widget.git";
	mutations.length = 0;
	selections.length = 0;
	runs.length = 0;
});
async function dispatch() {
	return dispatchAutomation({
		automation,
		relayUrl: "https://relay.fixture.test",
		trigger: { triggerId: "trigger", eventId: "event" },
	});
}
test("actual host dispatcher selects verified same-project GitLab MR through retained pr seam", async () => {
	expect(await dispatch()).toMatchObject({ status: "dispatched" });
	expect(
		mutations.find((x) => x.procedure === "workspaces.create")?.input,
	).toMatchObject({ projectId: "project", pr: 12 });
	expect(selections).not.toContain("github_repositories");
});
test("GL project case, instance port, row repository and fork ancestry refuse an MR checkout", async () => {
	for (const change of [
		() => {
			cloneUrl = "https://gitlab.example.test/Team/Widget.git";
		},
		() => {
			cloneUrl = "https://gitlab.example.test:8443/team/Widget.git";
		},
		() => {
			repositoryId = "8";
		},
		() => {
			payload.sourceProjectId = "8";
			payload.fork = true;
		},
		() => {
			payload.targetProjectId = null;
		},
		() => {
			eventOrg = "other-org";
		},
	]) {
		mutations.length = 0;
		change();
		await dispatch();
		expect(
			mutations.find((x) => x.procedure === "workspaces.create")?.input.pr,
		).toBeUndefined();
		cloneUrl = "https://gitlab.example.test:8443/Team/Widget.git";
		repositoryId = "7";
		payload.sourceProjectId = "7";
		payload.targetProjectId = "7";
		payload.fork = false;
		eventOrg = "org";
	}
});
test("GitHub checkout selection and ordinary non-provider dispatch retain original behavior", async () => {
	provider = "github";
	cloneUrl = "https://github.com/TEAM/widget.git";
	repositoryId = "99";
	payload = {
		pull_request: {
			number: 22,
			head: { ref: "feature", repo: { fork: false } },
		},
	};
	await dispatch();
	expect(
		mutations.find((x) => x.procedure === "workspaces.create")?.input.pr,
	).toBe(22);
	expect(selections).toContain("github_repositories");
	provider = "slack";
	payload = {};
	mutations.length = 0;
	await dispatch();
	expect(
		mutations.find((x) => x.procedure === "workspaces.create")?.input.pr,
	).toBeUndefined();
	expect(mutations.some((x) => x.procedure === "agents.run")).toBe(true);
});

test("GL event identity is re-read with tenant/provider filters and native projects retain tenant boundary", async () => {
	await dispatch();
	expect(eventQueries).toHaveLength(2);
	const scoped = eventQueries[1];
	if (!scoped) throw Error("Missing scoped event query");
	expect(new PgDialect().sqlToQuery(scoped.where).params).toEqual([
		"event",
		"org",
		"gitlab",
	]);
	expect(eventQueries[1]?.columns).toMatchObject({
		payload: true,
		integrationConnectionId: true,
		organizationId: true,
	});
	mutations.length = 0;
	projectOrg = "other-org";
	await dispatch();
	expect(
		mutations.find((x) => x.procedure === "workspaces.create")?.input.pr,
	).toBeUndefined();
});
test("explicit host refusal keeps legacy fresh-branch fallback while unknown transport failure does not create twice", async () => {
	createFailure = "refused";
	expect(await dispatch()).toMatchObject({ status: "dispatched" });
	const creates = mutations.filter((x) => x.procedure === "workspaces.create");
	expect(creates).toHaveLength(2);
	expect(creates[0]?.input.pr).toBe(12);
	expect(typeof creates[1]?.input.branch).toBe("string");
	mutations.length = 0;
	createFailure = "transport";
	expect(await dispatch()).toMatchObject({ status: "dispatch_failed" });
	expect(
		mutations.filter((x) => x.procedure === "workspaces.create"),
	).toHaveLength(1);
	expect(mutations.some((x) => x.procedure === "agents.run")).toBe(false);
});
