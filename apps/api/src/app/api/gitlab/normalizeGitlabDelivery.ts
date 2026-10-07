import type { GitLabConfig } from "@superset/db/schema";
import { gitlabEventNames } from "@superset/shared/automation-matching";
import { readGitlabConfig } from "@superset/trpc/lib/gitlab/config";
import { gitlabScopeAllows } from "@superset/trpc/lib/gitlab/scope";
import { z } from "zod";
import type { NormalizedDelivery } from "@/lib/automations/ingestAutomationEvent";

const labels = z.array(z.object({ title: z.string().optional() }));
const numericId = z
	.number()
	.int()
	.positive()
	.max(Number.MAX_SAFE_INTEGER)
	.nullish();
const projectDescriptor = z
	.object({
		id: numericId,
		path_with_namespace: z.string().optional(),
		web_url: z.string().optional(),
	})
	.refine(
		(project) =>
			project.id !== undefined ||
			project.path_with_namespace !== undefined ||
			project.web_url !== undefined,
		"GitLab project descriptor requires identity",
	);
export const gitlabDeliverySchema = z
	.object({
		object_kind: z.string().optional(),
		user: z
			.object({ id: numericId, username: z.string().optional() })
			.nullish(),
		user_id: numericId,
		user_username: z.string().optional(),
		project_id: numericId,
		project: z
			.object({
				id: numericId,
				path_with_namespace: z.string().optional(),
				web_url: z.string().optional(),
			})
			.optional(),
		object_attributes: z
			.object({
				id: numericId,
				iid: numericId,
				project_id: numericId,
				action: z.string().optional(),
				draft: z.boolean().optional(),
				state: z.string().optional(),
				title: z.string().optional(),
				url: z.string().optional(),
				note: z.string().optional(),
				noteable_type: z.string().optional(),
				source_project_id: numericId,
				target_project_id: numericId,
				source_branch: z.string().optional(),
				ref: z.string().optional(),
				source: z.union([z.string(), projectDescriptor]).nullish(),
				target: projectDescriptor.nullish(),
				status: z.string().optional(),
				oldrev: z.string().nullish(),
				labels: labels.optional(),
			})
			.optional(),
		changes: z.object({ labels: z.unknown().optional() }).optional(),
		merge_request: z
			.object({
				iid: numericId,
				source_branch: z.string().optional(),
				source_project_id: numericId,
				target_project_id: numericId,
				labels: labels.optional(),
				source: projectDescriptor.nullish(),
				target: projectDescriptor.nullish(),
			})
			.nullish(),
		labels: labels.optional(),
		ref: z.string().optional(),
	})
	.superRefine((payload, context) => {
		const source = payload.object_attributes?.source;
		if (source == null) return;
		if (
			(payload.object_kind === "merge_request" && typeof source === "string") ||
			(payload.object_kind === "pipeline" && typeof source !== "string")
		) {
			context.addIssue({
				code: "custom",
				path: ["object_attributes", "source"],
				message: "Invalid GitLab event source",
			});
		}
	});
export type GitLabWebhookPayload = z.infer<typeof gitlabDeliverySchema>;

const ordinaryPipelineSources = new Set([
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
]);

function branchRef(ref: string | null): string | null {
	if (!ref) return null;
	return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

function ancestryId(
	first: number | null | undefined,
	second: number | null | undefined,
): string | null {
	if (first != null && second != null && first !== second) return null;
	const id = first ?? second;
	return id == null ? null : String(id);
}

function containsControls(value: string): boolean {
	return Array.from(value).some(
		(character) =>
			character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
	);
}

function displayUrl(
	raw: string | undefined,
	host: string,
	projectPath: string,
	projectRoot = false,
): string | null {
	if (
		!raw ||
		/[\s\\]/.test(raw) ||
		containsControls(raw) ||
		/(?:^|\/)\.{1,2}(?:\/|[?#]|$)|%2e|%2f|%5c/i.test(raw)
	)
		return null;
	try {
		const url = new URL(raw);
		const path = decodeURIComponent(url.pathname);
		const root = `/${projectPath}`;
		if (
			url.origin !== `https://${host}` ||
			url.username ||
			url.password ||
			url.search ||
			/[%\\?#:\s]/.test(path) ||
			containsControls(path) ||
			!(
				path === root ||
				(projectRoot ? path === `${root}/` : path.startsWith(`${root}/`))
			)
		)
			return null;
		return url.href;
	} catch {
		return null;
	}
}

function descriptorAgrees(
	descriptor: z.infer<typeof projectDescriptor> | null | undefined,
	projectId: string | null,
	repositoryId: string,
	host: string,
	projectPath: string,
): boolean {
	if (descriptor === undefined) return true;
	if (descriptor === null || projectId === null) return false;
	if (
		descriptor.id !== undefined &&
		(descriptor.id === null || String(descriptor.id) !== projectId)
	)
		return false;
	if (projectId !== repositoryId) return true;
	return (
		(descriptor.path_with_namespace === undefined ||
			descriptor.path_with_namespace === projectPath) &&
		(descriptor.web_url === undefined ||
			displayUrl(descriptor.web_url, host, projectPath, true) !== null)
	);
}

export function normalizeGitlabDelivery(params: {
	organizationId: string;
	connectionId: string;
	config: GitLabConfig;
	deliveryId: string;
	payload: GitLabWebhookPayload;
}): NormalizedDelivery {
	const parsed = gitlabDeliverySchema.safeParse(params.payload);
	if (!parsed.success) return { skip: "Invalid GitLab delivery payload" };
	const config = readGitlabConfig(params.config);
	if (!config) return { skip: "Invalid GitLab connection configuration" };
	const payload = parsed.data;
	const deliveryProject = payload.project;
	const projectId = deliveryProject?.id;
	const projectPath = deliveryProject?.path_with_namespace;
	if (!deliveryProject || projectId == null || !projectPath)
		return { skip: "GitLab delivery missing project identity" };
	if (
		!gitlabScopeAllows(config, projectPath) ||
		(config.scopeKind !== "group" &&
			config.scopeId !== undefined &&
			config.scopeId !== String(projectId))
	) {
		return { skip: "GitLab project outside connection scope" };
	}
	const attributes = payload.object_attributes;
	if (
		(payload.project_id != null && payload.project_id !== projectId) ||
		(attributes?.project_id != null && attributes.project_id !== projectId)
	) {
		return { skip: "GitLab delivery has conflicting project identity" };
	}
	if (
		deliveryProject.web_url !== undefined &&
		!displayUrl(deliveryProject.web_url, config.host, projectPath, true)
	) {
		return { skip: "GitLab project does not match connection instance" };
	}
	const objectKind = payload.object_kind ?? "";
	const pipeline = objectKind === "pipeline";
	const pipelineSource =
		typeof attributes?.source === "string" ? attributes.source : null;
	const noteableType = attributes?.noteable_type ?? null;
	const rawRef = pipeline
		? (attributes?.ref ??
			attributes?.source_branch ??
			payload.merge_request?.source_branch ??
			payload.ref ??
			null)
		: (attributes?.source_branch ??
			payload.merge_request?.source_branch ??
			payload.ref ??
			null);
	const hasMergeRequest =
		objectKind === "merge_request" ||
		noteableType === "MergeRequest" ||
		payload.merge_request != null ||
		attributes?.source_project_id !== undefined ||
		attributes?.target_project_id !== undefined ||
		(typeof attributes?.source === "object" && attributes.source !== null) ||
		attributes?.target !== undefined ||
		(pipeline &&
			(pipelineSource === "merge_request_event" ||
				pipelineSource === "external_pull_request_event" ||
				pipelineSource === "parent_pipeline" ||
				[attributes?.ref, attributes?.source_branch, payload.ref].some((ref) =>
					ref?.startsWith("refs/merge-requests/"),
				)));
	const sourceProjectId = ancestryId(
		attributes?.source_project_id,
		payload.merge_request?.source_project_id,
	);
	const targetProjectId = ancestryId(
		attributes?.target_project_id,
		payload.merge_request?.target_project_id,
	);
	const repositoryId = String(projectId);
	const mergeRequest = hasMergeRequest
		? { sourceProjectId, targetProjectId }
		: null;
	const descriptorsAgree =
		descriptorAgrees(
			typeof attributes?.source === "string" ? undefined : attributes?.source,
			sourceProjectId,
			repositoryId,
			config.host,
			projectPath,
		) &&
		descriptorAgrees(
			attributes?.target,
			targetProjectId,
			repositoryId,
			config.host,
			projectPath,
		) &&
		descriptorAgrees(
			payload.merge_request?.source,
			sourceProjectId,
			repositoryId,
			config.host,
			projectPath,
		) &&
		descriptorAgrees(
			payload.merge_request?.target,
			targetProjectId,
			repositoryId,
			config.host,
			projectPath,
		);
	const ordinary =
		(!pipeline || ordinaryPipelineSources.has(pipelineSource ?? "")) &&
		(objectKind !== "note" ||
			["Issue", "Commit", "Snippet"].includes(noteableType ?? ""));
	let fork: boolean | null = null;
	if (mergeRequest) {
		if (
			descriptorsAgree &&
			sourceProjectId !== null &&
			targetProjectId !== null
		) {
			if (sourceProjectId !== targetProjectId) fork = true;
			else if (targetProjectId === repositoryId) fork = false;
		}
	} else if (ordinary) {
		fork = false;
	}
	const names = gitlabEventNames({
		objectKind,
		action: attributes?.action ?? null,
		draft: attributes?.draft === true,
		merged: attributes?.state === "merged",
		noteableType,
		pipelineStatus: attributes?.status ?? null,
		labelsChanged: payload.changes?.labels !== undefined,
		commitsPushed: Boolean(attributes?.oldrev),
	});
	const mergeRequestNumber =
		objectKind === "merge_request"
			? ancestryId(attributes?.iid, payload.merge_request?.iid)
			: ancestryId(payload.merge_request?.iid, undefined);
	const iid = mergeRequestNumber === null ? null : Number(mergeRequestNumber);
	const ref = branchRef(rawRef);
	const eventType = names[0] ?? objectKind;
	const actorLogin = payload.user?.username ?? payload.user_username ?? null;
	const actorId = payload.user?.id ?? payload.user_id;
	return {
		event: {
			organizationId: params.organizationId,
			integrationConnectionId: params.connectionId,
			provider: "gitlab",
			eventType,
			externalEventId: params.deliveryId,
			title: attributes?.title ?? eventType,
			url:
				displayUrl(attributes?.url, config.host, projectPath) ??
				new URL(`https://${config.host}/${projectPath}`).href,
			repositoryId,
			ref,
			actorLogin,
			payload: {
				iid,
				fork,
				projectPath,
				host: config.host,
				repositoryId,
				sourceProjectId,
				targetProjectId,
				mergeRequest,
				objectKind,
				noteableType,
			},
		},
		dispatch:
			names.length === 0 || fork !== false
				? null
				: {
						event: {
							provider: "gitlab",
							eventType,
							actorId: actorId == null ? null : String(actorId),
							actorLogin,
							body: attributes?.note ?? null,
							host: config.host,
							repositoryId,
							projectPath,
							ref,
							labels: (
								payload.labels ??
								attributes?.labels ??
								payload.merge_request?.labels ??
								[]
							)
								.map((label) => label.title)
								.filter((title): title is string => typeof title === "string"),
							isFork: fork,
							mergeRequest,
							names,
						},
					},
	};
}
