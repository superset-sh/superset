import { beforeEach, expect, mock, test } from "bun:test";
import type { GitlabCheckout } from "../../lib/gitlab/types";
import type { DispatchableAutomation } from "./dispatch";

let binding: GitlabCheckout | null,
	credentialsAvailable = true,
	metadataFork = false,
	transient = false;
const calls: string[] = [],
	starts: Array<Record<string, unknown>> = [];
const automation: DispatchableAutomation = {
	id: "automation",
	name: "Review",
	organizationId: "org",
	ownerUserId: "user",
	agent: "agent",
	prompt: "review",
	targetHostId: "cloud",
	v2ProjectId: null,
	v2WorkspaceId: null,
	cloudWorkspaceId: null,
	environmentId: "environment",
	tags: [],
	continueAgentSession: false,
};
const config = {
	provider: "gitlab" as const,
	host: "gitlab.example.test:8443",
	groupPath: "Team/Widget",
	scopeKind: "project" as const,
	scopeId: "7",
	auth: "token" as const,
	webhookSecret: "FAKE_SECRET",
};
mock.module("@superset/db/client", () => ({
	db: {
		select: () => {
			const query = {
				from: () => query,
				where: () => query,
				limit: async () => [{ id: "member" }],
			};
			return query;
		},
		query: {
			environments: { findFirst: async () => ({ hooksRepositoryId: "99" }) },
		},
	},
}));
mock.module("../../env", () => ({ env: {} }));
mock.module("../../lib/cloud-guards", () => ({
	cloudAccess: async () => ({ enabled: true }),
}));
mock.module("../../lib/sandbox", () => ({
	SandboxNotReadyError: class extends Error {},
	SandboxUnavailableError: class extends Error {},
	environmentRepositoryRows: async () => [{ repoId: "99" }],
	primaryRepository: (rows: unknown[]) => rows[0],
	sandboxHostSecretFor: async () => "FAKE",
}));
mock.module("../cloud-workspace/start", () => ({
	startCloudWorkspace: async (args: Record<string, unknown>) => {
		starts.push(args);
		return { id: "workspace" };
	},
}));
mock.module("../cloud-workspace/transition", () => ({
	transitionCloudWorkspace: async () => {},
}));
mock.module("../cloud-workspace/wake", () => ({
	markSandboxUnavailable: async () => {},
	wakeCloudWorkspace: async () => null,
}));
mock.module("../../lib/gitlab/environment-project", () => ({
	loadGitlabEnvironmentProject: async (id: string, org: string) => {
		expect([id, org]).toEqual(["environment", "org"]);
		calls.push("binding");
		return binding;
	},
}));
mock.module("../../lib/gitlab/connection", () => ({
	gitlabCredentialsFor: async (id: string, options: unknown) => {
		expect(id).toBe("connection");
		expect(options).toMatchObject({
			organizationId: "org",
			expected: { host: config.host, projectPath: "Team/Widget" },
		});
		calls.push("credentials");
		return credentialsAvailable
			? {
					connectionId: id,
					organizationId: "org",
					token: "FAKE_SELECTED",
					config,
				}
			: null;
	},
}));
mock.module("../../lib/gitlab/automation-provenance", () => ({
	gitlabMergeRequestProvenance: async (
		_credentials: unknown,
		args: unknown,
	) => {
		expect(args).toEqual({
			projectId: "7",
			projectPath: "Team/Widget",
			iid: 12,
		});
		calls.push("metadata");
		if (transient) throw Error("FAKE_RETRYABLE");
		return {
			iid: 12,
			sourceProjectId: metadataFork ? "8" : "7",
			targetProjectId: "7",
			sourceBranch: "Current-Head",
			headSha: "a".repeat(40),
		};
	},
}));
const { runInCloud } = await import("./cloudDispatch");
let event: {
	provider: string;
	repositoryId: string | null;
	payload: Record<string, unknown>;
	organizationId: string;
	integrationConnectionId: string;
};
beforeEach(() => {
	calls.length = 0;
	starts.length = 0;
	credentialsAvailable = true;
	metadataFork = false;
	transient = false;
	binding = {
		connectionId: "connection",
		projectId: "7",
		pathWithNamespace: "Team/Widget",
		cloneUrl: "https://gitlab.example.test:8443/Team/Widget.git",
		defaultBranch: "main",
	};
	event = {
		provider: "gitlab",
		repositoryId: "7",
		organizationId: "org",
		integrationConnectionId: "connection",
		payload: {
			host: config.host,
			projectPath: "Team/Widget",
			repositoryId: "7",
			iid: 12,
			fork: false,
			sourceProjectId: "7",
			targetProjectId: "7",
			objectKind: "merge_request",
			ref: "Stale-Head",
		},
	};
});
async function run() {
	return runInCloud({ automation, prompt: "review", event, placed: () => {} });
}
test("actual cloud caller uses current selected MR source branch rather than stale event head", async () => {
	await run();
	expect(starts[0]?.branch).toBe("Current-Head");
	expect(calls).toEqual(["binding", "credentials", "metadata"]);
});
test("tenant, connection, outer repository, exact host and path gate before credentials", async () => {
	const changes = [
		() => {
			event.organizationId = "other";
		},
		() => {
			event.integrationConnectionId = "other";
		},
		() => {
			event.repositoryId = "8";
		},
		() => {
			event.payload.host = "gitlab.example.test";
		},
		() => {
			event.payload.projectPath = "team/Widget";
		},
		() => {
			event.payload.fork = true;
		},
	];
	for (const change of changes) {
		const saved = structuredClone(event);
		calls.length = 0;
		starts.length = 0;
		change();
		await run();
		expect(starts[0]?.branch).toBeUndefined();
		expect(calls).not.toContain("credentials");
		event = saved;
	}
});
test("missing scoped credentials and current fork metadata never select MR branch; transient failures retry", async () => {
	credentialsAvailable = false;
	await run();
	expect(starts[0]?.branch).toBeUndefined();
	credentialsAvailable = true;
	metadataFork = true;
	starts.length = 0;
	await run();
	expect(starts[0]?.branch).toBeUndefined();
	metadataFork = false;
	transient = true;
	starts.length = 0;
	await expect(run()).rejects.toThrow("FAKE_RETRYABLE");
	expect(starts).toEqual([]);
});
test("GitHub cloud selection retains its original repository and event head behavior", async () => {
	event.provider = "github";
	event.repositoryId = "99";
	event.payload = {
		pull_request: {
			number: 22,
			head: { ref: "github-head", repo: { fork: false } },
		},
	};
	await run();
	expect(starts[0]?.branch).toBe("github-head");
	expect(calls).toEqual([]);
});
test("selected environment binding must remain the exact event connection and repository", async () => {
	const original = binding;
	if (!original) throw Error("Missing fixture binding");
	for (const wrong of [
		null,
		{ ...original, connectionId: "other" },
		{ ...original, projectId: "8" },
		{ ...original, pathWithNamespace: "team/Widget" },
		{
			...original,
			cloneUrl: "https://other.example.test:8443/Team/Widget.git",
		},
	]) {
		calls.length = 0;
		starts.length = 0;
		binding = wrong;
		await run();
		expect(starts[0]?.branch).toBeUndefined();
		expect(calls).not.toContain("credentials");
		expect(calls).not.toContain("metadata");
	}
});
test("ordinary GitLab events keep the environment default without querying MR metadata", async () => {
	event.payload = {
		host: config.host,
		projectPath: "Team/Widget",
		repositoryId: "7",
		fork: false,
		objectKind: "push",
		mergeRequest: null,
	};
	await run();
	expect(starts[0]?.branch).toBeUndefined();
	expect(calls).not.toContain("credentials");
	expect(calls).not.toContain("metadata");
});
