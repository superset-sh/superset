import {
	type GitlabMergeRequestProvenance,
	gitlabMergeRequestProvenance,
	gitlabPipelineProvenance,
	gitlabPipelineSourceSupported,
} from "@superset/trpc/lib/gitlab/automation-provenance";
import { readGitlabConfig } from "@superset/trpc/lib/gitlab/config";
import { gitlabCredentialsFor } from "@superset/trpc/lib/gitlab/connection";
import { z } from "zod";
import {
	gitlabDeliverySchema,
	normalizeGitlabDelivery,
} from "./normalizeGitlabDelivery";

type Params = Omit<Parameters<typeof normalizeGitlabDelivery>[0], "payload"> & {
	payload: unknown;
};
type Options = Parameters<typeof gitlabPipelineProvenance>[2] & {
	credentials?: typeof gitlabCredentialsFor;
};
const pipelineHash = z.object({
	object_attributes: z
		.object({
			sha: z
				.string()
				.regex(/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/)
				.nullish(),
		})
		.optional(),
});
function branchRef(value: string | null | undefined): string | null {
	return value?.startsWith("refs/heads/") ? value.slice(11) : (value ?? null);
}

export async function enrichGitlabDelivery(
	params: Params,
	options: Options = {},
) {
	const parsed = gitlabDeliverySchema.safeParse(params.payload);
	if (!parsed.success) return { skip: "Invalid GitLab delivery payload" };
	const payload = parsed.data;
	const normalized = normalizeGitlabDelivery({ ...params, payload });
	if ("skip" in normalized) return normalized;
	const pipeline = payload.object_kind === "pipeline";
	const claimedSource =
		typeof payload.object_attributes?.source === "string"
			? payload.object_attributes.source
			: null;
	const baseline =
		pipeline && !gitlabPipelineSourceSupported(claimedSource)
			? { ...normalized, dispatch: null }
			: normalized;
	if (baseline.dispatch) return baseline;
	if (
		pipeline &&
		claimedSource !== null &&
		claimedSource !== "parent_pipeline" &&
		!gitlabPipelineSourceSupported(claimedSource)
	)
		return baseline;
	const config = readGitlabConfig(params.config);
	if (!config || !payload.project?.id || !payload.project.path_with_namespace)
		return baseline;
	const attributes = payload.object_attributes;
	const mrEvent =
		payload.object_kind === "merge_request" ||
		attributes?.noteable_type === "MergeRequest";
	if (!pipeline && !mrEvent) return baseline;
	if (
		attributes?.iid != null &&
		payload.merge_request?.iid != null &&
		payload.object_kind === "merge_request" &&
		attributes.iid !== payload.merge_request.iid
	)
		return baseline;
	const iid =
		payload.object_kind === "merge_request"
			? (attributes?.iid ?? payload.merge_request?.iid)
			: payload.merge_request?.iid;
	if ((pipeline && attributes?.id == null) || (!pipeline && iid == null))
		return baseline;
	const credentials = await (options.credentials ?? gitlabCredentialsFor)(
		params.connectionId,
		{
			organizationId: params.organizationId,
			expected: {
				host: config.host,
				projectPath: payload.project.path_with_namespace,
			},
			...(options.send ? { send: options.send } : {}),
		},
	);
	const currentConfig = readGitlabConfig(credentials?.config);
	if (
		!credentials ||
		credentials.connectionId !== params.connectionId ||
		credentials.organizationId !== params.organizationId ||
		!currentConfig ||
		JSON.stringify(currentConfig) !== JSON.stringify(config)
	)
		return baseline;
	const identity = {
		projectId: String(payload.project.id),
		projectPath: payload.project.path_with_namespace,
	};
	let mergeRequest: GitlabMergeRequestProvenance | null;
	let source = attributes?.source;
	let ref = attributes?.ref;
	let pipelineContext: Record<string, unknown> | undefined;
	if (pipeline) {
		const hash = pipelineHash.safeParse(params.payload);
		if (!hash.success) return baseline;
		const proof = await gitlabPipelineProvenance(
			credentials,
			{ ...identity, pipelineId: attributes?.id ?? 0 },
			options,
		);
		if (
			!proof ||
			(attributes?.source && attributes.source !== proof.pipelineSource) ||
			(hash.data.object_attributes?.sha &&
				hash.data.object_attributes.sha.toLowerCase() !==
					proof.sha.toLowerCase())
		)
			return baseline;
		mergeRequest = proof.mergeRequest;
		for (const claimed of [attributes?.ref, payload.ref]) {
			if (
				claimed !== undefined &&
				branchRef(claimed) !== branchRef(proof.ref) &&
				branchRef(claimed) !== mergeRequest?.sourceBranch
			)
				return baseline;
		}
		for (const claimed of [
			attributes?.source_branch,
			payload.merge_request?.source_branch,
		]) {
			if (
				claimed !== undefined &&
				branchRef(claimed) !==
					(mergeRequest?.sourceBranch ?? branchRef(proof.ref))
			)
				return baseline;
		}
		ref = mergeRequest?.sourceBranch ?? proof.ref;
		source = proof.source;
		pipelineContext = {
			id: String(attributes?.id),
			ids: proof.pipelineIds,
			source: attributes?.source ?? null,
			rootSource: proof.source,
			ref: proof.ref,
			sha: proof.sha,
		};
	} else {
		mergeRequest = await gitlabMergeRequestProvenance(
			credentials,
			{ ...identity, iid: iid ?? 0 },
			options,
		);
		if (!mergeRequest) return baseline;
		for (const claimed of [
			attributes?.source_branch,
			payload.merge_request?.source_branch,
			attributes?.ref,
			payload.ref,
		]) {
			if (
				claimed !== undefined &&
				branchRef(claimed) !== mergeRequest.sourceBranch
			)
				return baseline;
		}
	}
	for (const [claimed, actual] of [
		[attributes?.source_project_id, mergeRequest?.sourceProjectId],
		[attributes?.target_project_id, mergeRequest?.targetProjectId],
		[payload.merge_request?.source_project_id, mergeRequest?.sourceProjectId],
		[payload.merge_request?.target_project_id, mergeRequest?.targetProjectId],
		[payload.merge_request?.iid, mergeRequest?.iid],
	])
		if (claimed != null && String(claimed) !== String(actual)) return baseline;
	if (payload.merge_request != null && !mergeRequest) return baseline;
	const enriched = normalizeGitlabDelivery({
		...params,
		payload: {
			...payload,
			object_attributes: {
				...attributes,
				source,
				...(pipeline ? { ref } : {}),
			},
			...(mergeRequest
				? {
						merge_request: {
							...payload.merge_request,
							iid: mergeRequest.iid,
							source_project_id: Number(mergeRequest.sourceProjectId),
							target_project_id: Number(mergeRequest.targetProjectId),
							source_branch:
								payload.merge_request?.source_branch ??
								mergeRequest.sourceBranch,
						},
					}
				: {}),
		},
	});
	if (
		"skip" in enriched ||
		typeof enriched.event.payload !== "object" ||
		enriched.event.payload === null ||
		Array.isArray(enriched.event.payload)
	)
		return baseline;
	return {
		...enriched,
		event: {
			...enriched.event,
			payload: {
				...enriched.event.payload,
				...(pipelineContext ? { pipeline: pipelineContext } : {}),
			},
		},
	};
}
