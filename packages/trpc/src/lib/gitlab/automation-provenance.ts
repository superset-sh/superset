import { z } from "zod";
import { GitlabApiError, gitlabApiFetch } from "./api";
import { gitlabProjectMetadata } from "./cloud-options";
import { gitlabScopeAllows } from "./scope";
import { parseGitLabOrigin } from "./ssrf";
import { safeGitLabFetch } from "./transport";
import type { GitlabProjectCredentials } from "./types";

const supportedRootSources = new Set([
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
]);
export function gitlabPipelineSourceSupported(
	value: string | null | undefined,
): boolean {
	return typeof value === "string" && supportedRootSources.has(value);
}

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const stringId = z
	.string()
	.regex(/^[1-9]\d*$/)
	.refine((value) => Number.isSafeInteger(Number(value)));
const branch = z
	.string()
	.min(1)
	.max(1024)
	.refine(
		(value) =>
			!value.startsWith("-") &&
			!value.includes("..") &&
			!/[\s~^:?*[\\]/.test(value) &&
			!Array.from(value).some(
				(character) =>
					character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
			),
	);
const sha = z.string().regex(/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/);
const projectNode = z.object({ id: z.string(), fullPath: z.string() });
const mergeRequestNode = z.object({
	iid: stringId,
	sourceProjectId: positiveId,
	sourceBranch: branch,
	targetProject: projectNode,
});
const pipelineNode = z.object({
	id: z.string(),
	source: z.string().min(1),
	ref: branch,
	sha,
	project: projectNode,
	mergeRequest: mergeRequestNode.nullable(),
	upstream: z.object({ id: z.string() }).nullable(),
});
const pipelineResponse = z.object({
	data: z.object({
		project: projectNode
			.extend({ pipeline: pipelineNode.nullable() })
			.nullable(),
	}),
	errors: z.array(z.unknown()).optional(),
});
const mrResponse = z.object({
	iid: positiveId,
	project_id: positiveId,
	source_project_id: positiveId,
	target_project_id: positiveId,
	source_branch: branch,
	sha,
	web_url: z.string(),
});

type Identity = { projectPath: string; projectId: string };
type Options = {
	send?: typeof gitlabApiFetch;
	transport?: typeof safeGitLabFetch;
};
export interface GitlabMergeRequestProvenance {
	iid: number;
	sourceProjectId: string;
	targetProjectId: string;
	sourceBranch: string;
	headSha?: string;
}
export interface GitlabPipelineProvenance {
	pipelineSource: string;
	source: string;
	ref: string;
	sha: string;
	pipelineIds: string[];
	mergeRequest: GitlabMergeRequestProvenance | null;
}

const pipelineQuery = `query AutomationPipeline($projectPath: ID!, $pipelineId: CiPipelineID!) {
 project(fullPath: $projectPath) { id fullPath pipeline(id: $pipelineId) {
  id source ref sha project { id fullPath }
  mergeRequest { iid sourceProjectId sourceBranch targetProject { id fullPath } }
  upstream { id }
 } }
}`;

function gidNumber(value: string, model: string): string | null {
	const prefix = `gid://gitlab/${model}/`;
	if (!value.startsWith(prefix)) return null;
	const id = value.slice(prefix.length);
	return stringId.safeParse(id).success ? id : null;
}
function sameProject(
	value: z.infer<typeof projectNode>,
	identity: Identity,
): boolean {
	return (
		value.id === `gid://gitlab/Project/${identity.projectId}` &&
		value.fullPath === identity.projectPath
	);
}
function allowed(
	credentials: GitlabProjectCredentials,
	identity: Identity,
): boolean {
	return (
		stringId.safeParse(identity.projectId).success &&
		gitlabScopeAllows(credentials.config, identity.projectPath) &&
		(credentials.config.scopeKind === "group" ||
			credentials.config.scopeId === undefined ||
			credentials.config.scopeId === identity.projectId)
	);
}
async function data(response: Response, path: string): Promise<unknown> {
	if ([401, 403, 404].includes(response.status)) return null;
	if (!response.ok) throw new GitlabApiError(response.status, path);
	return response.json().catch(() => null);
}
async function selectedProject(
	credentials: GitlabProjectCredentials,
	identity: Identity,
	send: typeof gitlabApiFetch,
	signal: AbortSignal,
): Promise<boolean> {
	if (!allowed(credentials, identity)) return false;
	const value = await data(
		await send(
			parseGitLabOrigin(credentials.config.host).origin,
			credentials.token,
			`/projects/${encodeURIComponent(identity.projectPath)}`,
			{ signal },
		),
		"/projects/selected",
	);
	const project = gitlabProjectMetadata(credentials, value);
	return (
		project !== null &&
		project.projectId === identity.projectId &&
		project.pathWithNamespace === identity.projectPath
	);
}

export async function gitlabMergeRequestProvenance(
	credentials: GitlabProjectCredentials,
	args: Identity & { iid: number },
	options: Options = {},
): Promise<GitlabMergeRequestProvenance | null> {
	if (!positiveId.safeParse(args.iid).success || !allowed(credentials, args))
		return null;
	const signal = AbortSignal.timeout(10_000),
		send = options.send ?? gitlabApiFetch;
	if (!(await selectedProject(credentials, args, send, signal))) return null;
	const origin = parseGitLabOrigin(credentials.config.host).origin;
	const path = `/projects/${encodeURIComponent(args.projectPath)}/merge_requests/${args.iid}`;
	const parsed = mrResponse.safeParse(
		await data(await send(origin, credentials.token, path, { signal }), path),
	);
	if (!parsed.success) return null;
	const mr = parsed.data;
	if (
		mr.iid !== args.iid ||
		String(mr.project_id) !== args.projectId ||
		String(mr.target_project_id) !== args.projectId ||
		mr.web_url !== `${origin}/${args.projectPath}/-/merge_requests/${args.iid}`
	)
		return null;
	return {
		iid: mr.iid,
		sourceProjectId: String(mr.source_project_id),
		targetProjectId: String(mr.target_project_id),
		sourceBranch: mr.source_branch,
		headSha: mr.sha,
	};
}

export async function gitlabPipelineProvenance(
	credentials: GitlabProjectCredentials,
	args: Identity & { pipelineId: number },
	options: Options = {},
): Promise<GitlabPipelineProvenance | null> {
	if (
		!positiveId.safeParse(args.pipelineId).success ||
		!allowed(credentials, args)
	)
		return null;
	const signal = AbortSignal.timeout(10_000),
		send = options.send ?? gitlabApiFetch;
	if (!(await selectedProject(credentials, args, send, signal))) return null;
	const origin = parseGitLabOrigin(credentials.config.host).origin;
	const transport = options.transport ?? safeGitLabFetch;
	const pipelineIds: string[] = [];
	let association: GitlabMergeRequestProvenance | null = null;
	let id = String(args.pipelineId),
		initial: z.infer<typeof pipelineNode> | undefined;
	for (let depth = 0; depth < 16; depth++) {
		if (pipelineIds.includes(id)) return null;
		const response = await transport(
			`${origin}/api/graphql`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${credentials.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					query: pipelineQuery,
					variables: {
						projectPath: args.projectPath,
						pipelineId: `gid://gitlab/Ci::Pipeline/${id}`,
					},
				}),
				signal,
			},
			{ timeoutMs: 10_000, maxResponseBytes: 1024 * 1024 },
		);
		const parsed = pipelineResponse.safeParse(
			await data(response, "/api/graphql"),
		);
		if (!parsed.success || parsed.data.errors?.length) return null;
		const selected = parsed.data.data.project,
			node = selected?.pipeline;
		if (
			!selected ||
			!node ||
			!sameProject(selected, args) ||
			!sameProject(node.project, args) ||
			node.id !== `gid://gitlab/Ci::Pipeline/${id}` ||
			(node.source !== "parent_pipeline" &&
				!gitlabPipelineSourceSupported(node.source))
		)
			return null;
		if (initial && (initial.ref !== node.ref || initial.sha !== node.sha))
			return null;
		initial ??= node;
		pipelineIds.push(id);
		let mergeRequest: GitlabMergeRequestProvenance | null = null;
		if (node.mergeRequest) {
			if (!sameProject(node.mergeRequest.targetProject, args)) return null;
			mergeRequest = {
				iid: Number(node.mergeRequest.iid),
				sourceProjectId: String(node.mergeRequest.sourceProjectId),
				targetProjectId: args.projectId,
				sourceBranch: node.mergeRequest.sourceBranch,
			};
		}
		if (mergeRequest) {
			if (
				association &&
				JSON.stringify(association) !== JSON.stringify(mergeRequest)
			)
				return null;
			association = mergeRequest;
		}
		if (node.source !== "parent_pipeline") {
			if (node.source === "merge_request_event" && !mergeRequest) return null;
			if (association && !mergeRequest) return null;
			return {
				pipelineSource: initial.source,
				source: node.source,
				ref: initial.ref,
				sha: initial.sha,
				pipelineIds,
				mergeRequest,
			};
		}
		if (!node.upstream) return null;
		const parent = gidNumber(node.upstream.id, "Ci::Pipeline");
		if (!parent) return null;
		id = parent;
	}
	return null;
}
