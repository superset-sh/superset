import { timingSafeEqual } from "node:crypto";

/** Constant-time string compare (length-safe). Used to verify `X-Gitlab-Token`. */
export function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

export interface GitLabWebhookPayload {
	object_kind?: string;
	project?: { id?: number };
	object_attributes?: { iid?: number };
	merge_request?: { iid?: number };
}

export interface MergeRef {
	projectId: number;
	iid: number;
}

/**
 * Extracts the affected (projectId, iid) for any MR-related webhook event:
 * merge_request hooks carry it on `object_attributes`; pipeline/note hooks carry
 * it on `merge_request` (and only when attached to an MR). Returns null otherwise.
 */
export function extractMergeRef(
	payload: GitLabWebhookPayload,
): MergeRef | null {
	const projectId = payload.project?.id;
	const iid =
		payload.object_kind === "merge_request"
			? payload.object_attributes?.iid
			: payload.merge_request?.iid;
	if (!projectId || !iid) return null;
	return { projectId, iid };
}
