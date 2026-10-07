import { z } from "zod";
import type { gitlabApiFetch } from "./api";

const identifier = /^[1-9]\d*$/;
const shaSchema = z.string().regex(/^[a-fA-F0-9]{6,64}$/);
export function gitlabForkReadTarget(
	path: string,
	method: string,
	context: string | null,
) {
	if (
		!["GET", "HEAD"].includes(method) ||
		!context ||
		!identifier.test(context) ||
		!Number.isSafeInteger(Number(context))
	)
		return null;
	const url = new URL(path, "https://gitlab.invalid");
	const match =
		/^\/api\/v4\/projects\/([1-9]\d*)(?:\/(pipelines|repository\/commits\/[a-fA-F0-9]{6,64}\/statuses|pipelines\/[1-9]\d*\/jobs|jobs\/[1-9]\d*\/trace))?$/.exec(
			url.pathname,
		);
	if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
	return { projectId: Number(match[1]), mergeRequest: Number(context) };
}

export async function verifyGitlabForkRead(args: {
	origin: string;
	token: string;
	selectedProjectId: number;
	projectId: number;
	mergeRequest: number;
	path: string;
	send: typeof gitlabApiFetch;
}) {
	const read = async (path: string) => {
		const response = await args.send(args.origin, args.token, path);
		if (!response.ok) throw new Error("Unverified GitLab fork request");
		return response.json();
	};
	const mr = z
		.object({
			iid: z.literal(args.mergeRequest),
			target_project_id: z.literal(args.selectedProjectId),
			source_project_id: z.literal(args.projectId),
			sha: shaSchema.nullish(),
			diff_refs: z.object({ head_sha: shaSchema }).nullish(),
		})
		.parse(
			await read(
				`/projects/${args.selectedProjectId}/merge_requests/${args.mergeRequest}`,
			),
		);
	const headSha = mr.sha ?? mr.diff_refs?.head_sha;
	if (!headSha) throw new Error("Unverified GitLab fork head");
	const source = z
		.object({
			id: z.literal(args.projectId),
			path_with_namespace: z.string().min(1).max(1024),
			http_url_to_repo: z.string(),
		})
		.parse(await read(`/projects/${args.projectId}`));
	if (
		source.http_url_to_repo !==
		`${args.origin}/${source.path_with_namespace}.git`
	)
		throw new Error("Unverified GitLab fork identity");
	const url = new URL(args.path, args.origin);
	const pipeline = /\/pipelines\/([1-9]\d*)\/jobs$/.exec(url.pathname);
	const job = /\/jobs\/([1-9]\d*)\/trace$/.exec(url.pathname);
	if (pipeline) {
		z.object({
			id: z.literal(Number(pipeline[1])),
			project_id: z.literal(args.projectId),
			sha: z.literal(headSha),
		}).parse(
			await read(`/projects/${args.projectId}/pipelines/${pipeline[1]}`),
		);
	}
	if (job) {
		z.object({
			id: z.literal(Number(job[1])),
			pipeline: z.object({
				project_id: z.literal(args.projectId),
				sha: z.literal(headSha),
			}),
		}).parse(await read(`/projects/${args.projectId}/jobs/${job[1]}`));
	}
	return {
		projectId: args.projectId,
		projectPath: source.path_with_namespace,
		headSha,
	};
}
