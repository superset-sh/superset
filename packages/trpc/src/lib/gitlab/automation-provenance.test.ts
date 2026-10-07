import { expect, test } from "bun:test";
import type { GitlabProjectCredentials } from "./types";

const credentials: GitlabProjectCredentials = {
	connectionId: "connection",
	token: "FAKE_SELECTED_TOKEN",
	config: {
		host: "gitlab.example.test:8443",
		groupPath: "Team/Widget",
		scopeKind: "project",
		scopeId: "7",
	},
};
const identity = { projectPath: "Team/Widget", projectId: "7" };
const sha = "a".repeat(40);
const project = {
	id: 7,
	path_with_namespace: "Team/Widget",
	http_url_to_repo: "https://gitlab.example.test:8443/Team/Widget.git",
	default_branch: "main",
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
const gqlMr = {
	iid: "12",
	sourceProjectId: 7,
	sourceBranch: "Feature",
	targetProject: { id: "gid://gitlab/Project/7", fullPath: "Team/Widget" },
};
function pipeline(
	id: number,
	source: string,
	upstream: number | null,
	mergeRequest: unknown = null,
	ref = "Feature",
	hash = sha,
) {
	return {
		id: `gid://gitlab/Ci::Pipeline/${id}`,
		source,
		sha: hash,
		ref,
		project: { id: "gid://gitlab/Project/7", fullPath: "Team/Widget" },
		mergeRequest,
		upstream:
			upstream === null
				? null
				: { id: `gid://gitlab/Ci::Pipeline/${upstream}` },
	};
}
const requests: string[] = [];
let projectValue: unknown = project,
	mrValue: unknown = mr;
let pipelines = new Map<number, unknown>();
const send = async (origin: string, token: string, path: string) => {
	expect(origin).toBe("https://gitlab.example.test:8443");
	expect(token).toBe("FAKE_SELECTED_TOKEN");
	requests.push(path);
	return Response.json(
		path.endsWith("/merge_requests/12") ? mrValue : projectValue,
	);
};
const transport = async (url: string | URL, init: RequestInit = {}) => {
	expect(String(url)).toBe("https://gitlab.example.test:8443/api/graphql");
	expect(new Headers(init.headers).get("authorization")).toBe(
		"Bearer FAKE_SELECTED_TOKEN",
	);
	const body = JSON.parse(String(init.body));
	expect(body.variables.projectPath).toBe("Team/Widget");
	expect(body.query).toContain("$pipelineId: CiPipelineID!");
	const id = Number(body.variables.pipelineId.split("/").at(-1));
	requests.push(`pipeline:${id}`);
	return Response.json({
		data: {
			project: {
				id: "gid://gitlab/Project/7",
				fullPath: "Team/Widget",
				pipeline: pipelines.get(id) ?? null,
			},
		},
	});
};
const { gitlabPipelineProvenance, gitlabMergeRequestProvenance } = await import(
	"./automation-provenance"
);
function reset() {
	requests.length = 0;
	projectValue = structuredClone(project);
	mrValue = structuredClone(mr);
	pipelines = new Map();
}
test("selected project and current MR source head are proven before checkout", async () => {
	reset();
	expect(
		await gitlabMergeRequestProvenance(
			credentials,
			{ ...identity, iid: 12 },
			{ send },
		),
	).toMatchObject({
		iid: 12,
		sourceProjectId: "7",
		targetProjectId: "7",
		sourceBranch: "Feature",
		headSha: sha,
	});
	expect(requests).toEqual([
		"/projects/Team%2FWidget",
		"/projects/Team%2FWidget/merge_requests/12",
	]);
});
test("MR ancestry never silently turns a fork into selected-project content", async () => {
	reset();
	mrValue = { ...mr, source_project_id: 8 };
	expect(
		await gitlabMergeRequestProvenance(
			credentials,
			{ ...identity, iid: 12 },
			{ send },
		),
	).toMatchObject({ sourceProjectId: "8", targetProjectId: "7" });
});
test("ordinary and MR nested child pipelines use real same-project parent links", async () => {
	for (const root of ["push", "merge_request_event"]) {
		reset();
		pipelines.set(30, pipeline(30, "parent_pipeline", 29));
		pipelines.set(29, pipeline(29, "parent_pipeline", 28));
		pipelines.set(28, pipeline(28, root, null, root === "push" ? null : gqlMr));
		expect(
			await gitlabPipelineProvenance(
				credentials,
				{ ...identity, pipelineId: 30 },
				{ send, transport },
			),
		).toMatchObject({
			source: root,
			pipelineIds: ["30", "29", "28"],
			mergeRequest:
				root === "push"
					? null
					: { iid: 12, sourceProjectId: "7", targetProjectId: "7" },
		});
	}
});
test("MR pipeline synthetic ref and SHA are not confused with its current source head", async () => {
	reset();
	pipelines.set(
		30,
		pipeline(
			30,
			"parent_pipeline",
			29,
			null,
			"refs/merge-requests/12/merge",
			"b".repeat(40),
		),
	);
	pipelines.set(
		29,
		pipeline(
			29,
			"merge_request_event",
			null,
			gqlMr,
			"refs/merge-requests/12/merge",
			"b".repeat(40),
		),
	);
	expect(
		await gitlabPipelineProvenance(
			credentials,
			{ ...identity, pipelineId: 30 },
			{ send, transport },
		),
	).toMatchObject({ mergeRequest: { iid: 12, sourceBranch: "Feature" } });
});
test("wrong scoped path or configured project ID never sends selected credentials", async () => {
	for (const wrong of [
		{ ...identity, projectPath: "Other/Widget" },
		{ ...identity, projectId: "8" },
	]) {
		reset();
		expect(
			await gitlabPipelineProvenance(
				credentials,
				{ ...wrong, pipelineId: 30 },
				{ send, transport },
			),
		).toBeNull();
		expect(requests).toEqual([]);
	}
});
test("provider metadata project ID, path and clone instance must all agree", async () => {
	for (const value of [
		{ ...project, id: 8 },
		{ ...project, path_with_namespace: "team/Widget" },
		{
			...project,
			http_url_to_repo: "https://gitlab.example.test/Team/Widget.git",
		},
	]) {
		reset();
		projectValue = value;
		expect(
			await gitlabPipelineProvenance(
				credentials,
				{ ...identity, pipelineId: 30 },
				{ send, transport },
			),
		).toBeNull();
		expect(requests).toHaveLength(1);
	}
});
test("cycles, inaccessible parents, different projects, refs and SHAs refuse dispatch proof", async () => {
	for (const parent of [
		null,
		pipeline(30, "parent_pipeline", 30),
		{
			...pipeline(29, "push", null),
			project: { id: "gid://gitlab/Project/8", fullPath: "Other/Widget" },
		},
		pipeline(29, "push", null, null, "Other"),
		pipeline(29, "push", null, null, "Feature", "b".repeat(40)),
	]) {
		reset();
		pipelines.set(30, pipeline(30, "parent_pipeline", 29));
		pipelines.set(29, parent);
		expect(
			await gitlabPipelineProvenance(
				credentials,
				{ ...identity, pipelineId: 30 },
				{ send, transport },
			),
		).toBeNull();
	}
});
test("parent depth beyond two remains supported and the declared traversal bound is explicit", async () => {
	reset();
	for (let id = 30; id > 20; id--)
		pipelines.set(id, pipeline(id, "parent_pipeline", id - 1));
	pipelines.set(20, pipeline(20, "push", null));
	expect(
		await gitlabPipelineProvenance(
			credentials,
			{ ...identity, pipelineId: 30 },
			{ send, transport },
		),
	).toMatchObject({
		pipelineIds: Array.from({ length: 11 }, (_, i) => String(30 - i)),
	});
	reset();
	for (let id = 50; id > 20; id--)
		pipelines.set(id, pipeline(id, "parent_pipeline", id - 1));
	expect(
		await gitlabPipelineProvenance(
			credentials,
			{ ...identity, pipelineId: 50 },
			{ send, transport },
		),
	).toBeNull();
	expect(requests.filter((x) => x.startsWith("pipeline:"))).toHaveLength(16);
});
test("partial GraphQL errors and malformed MR identity never provide ancestry", async () => {
	reset();
	expect(
		await gitlabPipelineProvenance(
			credentials,
			{ ...identity, pipelineId: 30 },
			{
				send,
				transport: async () =>
					Response.json({
						errors: [{ message: "FAKE_PRIVATE_GRAPHQL" }],
						data: { project: { pipeline: pipeline(30, "push", null) } },
					}),
			},
		),
	).toBeNull();
	for (const value of [
		{ ...mr, iid: 13 },
		{ ...mr, project_id: 8 },
		{ ...mr, target_project_id: 8 },
		{ ...mr, source_branch: "bad\nbranch" },
		{ ...mr, web_url: "https://other.test/Team/Widget/-/merge_requests/12" },
	]) {
		reset();
		mrValue = value;
		expect(
			await gitlabMergeRequestProvenance(
				credentials,
				{ ...identity, iid: 12 },
				{ send },
			),
		).toBeNull();
	}
});
test("missing permission is record-only but transient provider failure remains retryable", async () => {
	for (const status of [401, 403, 404]) {
		reset();
		expect(
			await gitlabPipelineProvenance(
				credentials,
				{ ...identity, pipelineId: 30 },
				{ send: async () => new Response(null, { status }), transport },
			),
		).toBeNull();
	}
	reset();
	await expect(
		gitlabPipelineProvenance(
			credentials,
			{ ...identity, pipelineId: 30 },
			{ send: async () => new Response(null, { status: 503 }), transport },
		),
	).rejects.toThrow("GitLab 503");
});
test("a child carrying the same MR association retains verified ancestry", async () => {
	reset();
	pipelines.set(30, pipeline(30, "parent_pipeline", 29, gqlMr));
	pipelines.set(29, pipeline(29, "merge_request_event", null, gqlMr));
	expect(
		await gitlabPipelineProvenance(
			credentials,
			{ ...identity, pipelineId: 30 },
			{ send, transport },
		),
	).toMatchObject({
		pipelineSource: "parent_pipeline",
		source: "merge_request_event",
		mergeRequest: { iid: 12 },
	});
	pipelines.set(
		29,
		pipeline(29, "merge_request_event", null, { ...gqlMr, iid: "13" }),
	);
	expect(
		await gitlabPipelineProvenance(
			credentials,
			{ ...identity, pipelineId: 30 },
			{ send, transport },
		),
	).toBeNull();
});
test("unsupported root sources cannot provide dispatch proof even with MR association", async () => {
	for (const source of [
		"future_unrecognized_source",
		"external_pull_request_event",
	])
		for (const association of [null, gqlMr]) {
			reset();
			pipelines.set(30, pipeline(30, "parent_pipeline", 29));
			pipelines.set(29, pipeline(29, source, null, association));
			expect(
				await gitlabPipelineProvenance(
					credentials,
					{ ...identity, pipelineId: 30 },
					{ send, transport },
				),
			).toBeNull();
		}
});
test("all retained ordinary root sources and known MR roots remain usable", async () => {
	for (const source of [
		"api",
		"chat",
		"external",
		"ondemand_dast_scan",
		"ondemand_dast_validation",
		"pipeline",
		"push",
		"schedule",
		"security_orchestration_policy",
		"trigger",
		"web",
		"webide",
		"pipeline_execution_policy",
		"pipeline_execution_policy_schedule",
		"scan_execution_policy",
		"container_registry_push",
		"merge_request_event",
	]) {
		reset();
		pipelines.set(30, pipeline(30, "parent_pipeline", 29));
		pipelines.set(
			29,
			pipeline(
				29,
				source,
				null,
				source === "merge_request_event" ? gqlMr : null,
			),
		);
		expect(
			await gitlabPipelineProvenance(
				credentials,
				{ ...identity, pipelineId: 30 },
				{ send, transport },
			),
		).toMatchObject({
			source,
			pipelineSource: "parent_pipeline",
			pipelineIds: ["30", "29"],
		});
	}
});
