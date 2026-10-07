import { expect, mock, test } from "bun:test";
import type { GitLabConfig } from "@superset/db/schema";
import { triggerMatches } from "@superset/shared/automation-matching";
import { normalizeGitlabDelivery } from "./normalizeGitlabDelivery";

mock.module("@superset/trpc/lib/gitlab/connection", () => ({
	gitlabCredentialsFor: async () => null,
}));
const { enrichGitlabDelivery } = await import("./enrichGitlabDelivery");
const config: GitLabConfig = {
	provider: "gitlab",
	host: "gitlab.example.test:8443",
	groupPath: "Team/Widget",
	auth: "token",
	webhookSecret: "FAKE_BUSINESS_SECRET",
	scopeKind: "project",
	scopeId: "7",
};
const sha = "a".repeat(40),
	project = {
		id: 7,
		path_with_namespace: "Team/Widget",
		http_url_to_repo: "https://gitlab.example.test:8443/Team/Widget.git",
	};
const mr = {
	iid: 12,
	project_id: 7,
	source_project_id: 7,
	target_project_id: 7,
	source_branch: "Feature",
	sha,
	web_url: "https://gitlab.example.test:8443/Team/Widget/-/merge_requests/12",
};
const base = {
	organizationId: "org",
	connectionId: "connection",
	config,
	deliveryId: "delivery",
};
const pipeline = {
	object_kind: "pipeline",
	project,
	object_attributes: {
		id: 30,
		source: "parent_pipeline",
		status: "success",
		ref: "Feature",
		sha,
	},
};
let calls: string[] = [],
	nodes = new Map<number, unknown>(),
	mrValue: unknown = mr;
const credentials = async (id: string, options: unknown) => {
	expect(id).toBe("connection");
	expect(options).toMatchObject({
		organizationId: "org",
		expected: { host: config.host, projectPath: "Team/Widget" },
	});
	calls.push("credentials");
	return {
		connectionId: id,
		organizationId: "org",
		token: "FAKE_SELECTED_TOKEN",
		config,
	};
};
const send = async (_origin: string, _token: string, path: string) => {
	calls.push(path);
	return Response.json(path.includes("merge_requests") ? mrValue : project);
};
const transport = async (_url: string | URL, init: RequestInit = {}) => {
	const body = JSON.parse(String(init.body));
	const id = Number(body.variables.pipelineId.split("/").at(-1));
	calls.push(`pipeline:${id}`);
	return Response.json({
		data: {
			project: {
				id: "gid://gitlab/Project/7",
				fullPath: "Team/Widget",
				pipeline: nodes.get(id) ?? null,
			},
		},
	});
};
function node(
	id: number,
	source: string,
	parent: number | null,
	mergeRequest: unknown = null,
) {
	return {
		id: `gid://gitlab/Ci::Pipeline/${id}`,
		ref: "Feature",
		sha,
		source,
		project: { id: "gid://gitlab/Project/7", fullPath: "Team/Widget" },
		upstream:
			parent === null ? null : { id: `gid://gitlab/Ci::Pipeline/${parent}` },
		mergeRequest,
	};
}
function reset() {
	calls = [];
	nodes = new Map([
		[30, node(30, "parent_pipeline", 29)],
		[29, node(29, "push", null)],
	]);
	mrValue = mr;
}
function match(
	delivery: Awaited<ReturnType<typeof enrichGitlabDelivery>>,
	event: string,
) {
	if ("skip" in delivery || !delivery.dispatch) return false;
	return triggerMatches(
		{
			kind: "gitlab",
			event,
			includeForks: false,
			projects: { mode: "list", ids: ["Team/Widget"] },
			branches: { mode: "list", ids: ["Feature"] },
			labels: { mode: "any" },
		},
		delivery.dispatch.event,
	).matches;
}
test("ordinary deliveries retain exact original normalizer outcomes without API work", async () => {
	reset();
	const payload = {
		...pipeline,
		object_attributes: { ...pipeline.object_attributes, source: "push" },
	};
	expect(
		await enrichGitlabDelivery(
			{ ...base, payload },
			{ credentials, send, transport },
		),
	).toEqual(normalizeGitlabDelivery({ ...base, payload }));
	expect(calls).toEqual([]);
});
test("ordinary child proof restores actual matching and persists parent context", async () => {
	reset();
	const delivery = await enrichGitlabDelivery(
		{ ...base, payload: pipeline },
		{ credentials, send, transport },
	);
	expect(match(delivery, "pipeline.success")).toBe(true);
	if ("skip" in delivery) throw Error("fixture skipped");
	expect(delivery.event.payload).toMatchObject({
		fork: false,
		pipeline: {
			id: "30",
			ids: ["30", "29"],
			source: "parent_pipeline",
			rootSource: "push",
			sha,
		},
		mergeRequest: null,
	});
});
test("MR child association restores matching and selected MR checkout ancestry", async () => {
	reset();
	nodes.set(
		29,
		node(29, "merge_request_event", null, {
			iid: "12",
			sourceProjectId: 7,
			sourceBranch: "Feature",
			targetProject: { id: "gid://gitlab/Project/7", fullPath: "Team/Widget" },
		}),
	);
	const delivery = await enrichGitlabDelivery(
		{ ...base, payload: pipeline },
		{ credentials, send, transport },
	);
	expect(match(delivery, "pipeline.success")).toBe(true);
	if ("skip" in delivery) throw Error("fixture skipped");
	expect(delivery.event.payload).toMatchObject({
		iid: 12,
		fork: false,
		sourceProjectId: "7",
		targetProjectId: "7",
	});
});
test("API-proven fork child remains recorded and cannot match", async () => {
	reset();
	nodes.set(
		29,
		node(29, "merge_request_event", null, {
			iid: "12",
			sourceProjectId: 8,
			sourceBranch: "Feature",
			targetProject: { id: "gid://gitlab/Project/7", fullPath: "Team/Widget" },
		}),
	);
	const delivery = await enrichGitlabDelivery(
		{ ...base, payload: pipeline },
		{ credentials, send, transport },
	);
	expect(match(delivery, "pipeline.success")).toBe(false);
	if ("skip" in delivery) throw Error("fixture skipped");
	expect(delivery.dispatch).toBeNull();
	expect(delivery.event.payload).toMatchObject({
		fork: true,
		sourceProjectId: "8",
		targetProjectId: "7",
	});
});
test("MR notes with missing ancestry can be enriched from exact IID API metadata", async () => {
	reset();
	const payload = {
		object_kind: "note",
		project,
		object_attributes: {
			noteable_type: "MergeRequest",
			note: "review",
			url: mr.web_url,
		},
		merge_request: { iid: 12, source_branch: "Feature" },
	};
	const delivery = await enrichGitlabDelivery(
		{ ...base, payload },
		{ credentials, send, transport },
	);
	expect(match(delivery, "note.added")).toBe(true);
	if ("skip" in delivery) throw Error("fixture skipped");
	expect(delivery.event.payload).toMatchObject({
		iid: 12,
		fork: false,
		sourceProjectId: "7",
		targetProjectId: "7",
	});
});
test("missing credentials and contradictory current grant never repair provenance", async () => {
	for (const getter of [
		async () => null,
		async () => ({
			connectionId: "connection",
			organizationId: "other-org",
			token: "FAKE",
			config,
		}),
		async () => ({
			connectionId: "connection",
			organizationId: "org",
			token: "FAKE",
			config: { ...config, host: "other.test" },
		}),
		async () => ({
			connectionId: "connection",
			organizationId: "org",
			token: "FAKE",
			config: { ...config, webhookSecret: "CHANGED_SECRET" },
		}),
	]) {
		reset();
		const result = await enrichGitlabDelivery(
			{ ...base, payload: pipeline },
			{ credentials: getter, send, transport },
		);
		expect(match(result, "pipeline.success")).toBe(false);
		expect(calls).toEqual([]);
	}
});
test("conflicting delivery source/ref/SHA or IID cannot be silently overwritten", async () => {
	for (const payload of [
		{
			...pipeline,
			object_attributes: {
				...pipeline.object_attributes,
				source_project_id: 8,
				target_project_id: 7,
			},
		},
		{
			...pipeline,
			object_attributes: { ...pipeline.object_attributes, ref: "Other" },
		},
		{
			...pipeline,
			object_attributes: { ...pipeline.object_attributes, sha: "b".repeat(40) },
		},
		{
			object_kind: "merge_request",
			project,
			object_attributes: { iid: 12, action: "open" },
			merge_request: { iid: 13 },
		},
	]) {
		reset();
		const result = await enrichGitlabDelivery(
			{ ...base, payload },
			{ credentials, send, transport },
		);
		expect(match(result, "pipeline.success")).toBe(false);
		if (!("skip" in result)) expect(result.dispatch).toBeNull();
	}
});
test("foreign project and malformed payload reject before credential lookup", async () => {
	for (const payload of [
		{
			...pipeline,
			project: { ...project, path_with_namespace: "Other/Widget" },
		},
		{ ...pipeline, project: { ...project, id: 8 } },
		{
			...pipeline,
			object_attributes: { ...pipeline.object_attributes, id: "30" },
		},
	]) {
		reset();
		const result = await enrichGitlabDelivery(
			{ ...base, payload },
			{ credentials, send, transport },
		);
		expect("skip" in result).toBe(true);
		expect(calls).toEqual([]);
	}
});
test("transient API failure remains retryable and unavailable association stays record-only", async () => {
	reset();
	await expect(
		enrichGitlabDelivery(
			{ ...base, payload: pipeline },
			{
				credentials,
				send: async () => new Response(null, { status: 503 }),
				transport,
			},
		),
	).rejects.toThrow("GitLab 503");
	reset();
	nodes.clear();
	const result = await enrichGitlabDelivery(
		{ ...base, payload: pipeline },
		{ credentials, send, transport },
	);
	expect(match(result, "pipeline.success")).toBe(false);
});
test("a claimed pipeline source must agree with the metadata of that exact pipeline", async () => {
	reset();
	const result = await enrichGitlabDelivery(
		{
			...base,
			payload: {
				...pipeline,
				object_attributes: {
					...pipeline.object_attributes,
					source: "unrecognized_source",
				},
			},
		},
		{ credentials, send, transport },
	);
	expect(match(result, "pipeline.success")).toBe(false);
	if (!("skip" in result)) expect(result.dispatch).toBeNull();
});
test("MR synthetic pipeline refs match the verified source branch without guessing the MR head SHA", async () => {
	reset();
	const association = {
		iid: "12",
		sourceProjectId: 7,
		sourceBranch: "Feature",
		targetProject: { id: "gid://gitlab/Project/7", fullPath: "Team/Widget" },
	};
	for (const id of [30, 29])
		nodes.set(id, {
			...node(
				id,
				id === 30 ? "parent_pipeline" : "merge_request_event",
				id === 30 ? 29 : null,
				id === 30 ? null : association,
			),
			ref: "refs/merge-requests/12/merge",
			sha: "b".repeat(40),
		});
	const result = await enrichGitlabDelivery(
		{
			...base,
			payload: {
				...pipeline,
				object_attributes: {
					...pipeline.object_attributes,
					ref: "refs/merge-requests/12/merge",
					sha: "b".repeat(40),
				},
			},
		},
		{ credentials, send, transport },
	);
	expect(match(result, "pipeline.success")).toBe(true);
	if ("skip" in result) throw Error("Unexpected fixture skip");
	expect(result.event.ref).toBe("Feature");
	expect(result.event.payload).toMatchObject({
		pipeline: { ref: "refs/merge-requests/12/merge", sha: "b".repeat(40) },
		iid: 12,
		fork: false,
	});
});
test("unsupported API root with an MR association remains record-only through actual matching", async () => {
	reset();
	nodes.set(
		29,
		node(29, "future_unrecognized_source", null, {
			iid: "12",
			sourceProjectId: 7,
			sourceBranch: "Feature",
			targetProject: { id: "gid://gitlab/Project/7", fullPath: "Team/Widget" },
		}),
	);
	const result = await enrichGitlabDelivery(
		{ ...base, payload: pipeline },
		{ credentials, send, transport },
	);
	expect(match(result, "pipeline.success")).toBe(false);
	if (!("skip" in result)) expect(result.dispatch).toBeNull();
});
test("unknown direct sources and explicit child ancestry cannot bypass root source policy", async () => {
	for (const source of [
		"future_unrecognized_source",
		"external_pull_request_event",
		"parent_pipeline",
	]) {
		reset();
		nodes.set(
			29,
			node(29, "future_unrecognized_source", null, {
				iid: "12",
				sourceProjectId: 7,
				sourceBranch: "Feature",
				targetProject: {
					id: "gid://gitlab/Project/7",
					fullPath: "Team/Widget",
				},
			}),
		);
		const result = await enrichGitlabDelivery(
			{
				...base,
				payload: {
					...pipeline,
					object_attributes: { ...pipeline.object_attributes, source },
					merge_request: {
						iid: 12,
						source_project_id: 7,
						target_project_id: 7,
						source_branch: "Feature",
					},
				},
			},
			{ credentials, send, transport },
		);
		expect(match(result, "pipeline.success")).toBe(false);
		if (!("skip" in result)) expect(result.dispatch).toBeNull();
	}
});
test("contradictory MR note branch and ref claims never change historical trigger eligibility", async () => {
	const note = {
		object_kind: "note",
		project,
		object_attributes: {
			noteable_type: "MergeRequest",
			note: "review",
			url: mr.web_url,
		},
		merge_request: { iid: 12 },
	};
	for (const payload of [
		{
			...note,
			merge_request: { ...note.merge_request, source_branch: "Other" },
		},
		{
			...note,
			object_attributes: { ...note.object_attributes, source_branch: "Other" },
		},
		{ ...note, object_attributes: { ...note.object_attributes, ref: "Other" } },
		{ ...note, ref: "Other" },
	]) {
		reset();
		const result = await enrichGitlabDelivery(
			{ ...base, payload },
			{ credentials, send, transport },
		);
		expect(match(result, "note.added")).toBe(false);
		if (!("skip" in result)) expect(result.dispatch).toBeNull();
	}
});
test("consistent MR note branch claims retain historical eligibility with normalized ref prefixes", async () => {
	reset();
	const payload = {
		object_kind: "note",
		project,
		ref: "refs/heads/Feature",
		object_attributes: {
			noteable_type: "MergeRequest",
			note: "review",
			url: mr.web_url,
			ref: "Feature",
			source_branch: "Feature",
		},
		merge_request: { iid: 12, source_branch: "refs/heads/Feature" },
	};
	const result = await enrichGitlabDelivery(
		{ ...base, payload },
		{ credentials, send, transport },
	);
	expect(match(result, "note.added")).toBe(true);
	if ("skip" in result) throw Error("Unexpected fixture skip");
	expect(result.event.ref).toBe("Feature");
});
test("pipeline association source-branch claims cannot disagree with verified MR source branch", async () => {
	for (const location of ["attributes", "merge_request"]) {
		reset();
		nodes.set(
			29,
			node(29, "merge_request_event", null, {
				iid: "12",
				sourceProjectId: 7,
				sourceBranch: "Feature",
				targetProject: {
					id: "gid://gitlab/Project/7",
					fullPath: "Team/Widget",
				},
			}),
		);
		const payload =
			location === "attributes"
				? {
						...pipeline,
						object_attributes: {
							...pipeline.object_attributes,
							source_branch: "Other",
						},
					}
				: { ...pipeline, merge_request: { iid: 12, source_branch: "Other" } };
		const result = await enrichGitlabDelivery(
			{ ...base, payload },
			{ credentials, send, transport },
		);
		expect(match(result, "pipeline.success")).toBe(false);
		if (!("skip" in result)) expect(result.dispatch).toBeNull();
	}
});
