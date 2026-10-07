import type { ParsedRemote } from "@superset/shared/git-remote";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { gitLabApiDeps } from "../../../../runtime/git/gitlab-api";
import { GitLabProviderClient } from "../../../../runtime/repo-providers/gitlab/gitlab-provider-client";
import { GitLabRestError } from "../../../../runtime/repo-providers/gitlab/gitlab-rest";
import type { HostServiceContext } from "../../../../types";
import { protectedProcedure } from "../../../index";
import {
	type ResolvedRepo,
	resolveGithubRepo,
	resolveRepo,
} from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";

const getContentInputSchema = z.object({
	projectId: z.string(),
	issueNumber: z.number().int().positive(),
	expectedIssueUrl: z.string().optional(),
});

const ghIssueContentSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	author: z.object({ login: z.string() }).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

const gitlabIssueContentSchema = ghIssueContentSchema.extend({
	body: z.string(),
	author: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

function parseIssueUrl(raw: string, issueNumber: number) {
	const match = /^https:\/\/([^/?#]+)(\/[^?#]*)$/i.exec(raw);
	if (!match || /[%@\\\s]/.test(match[1] ?? ""))
		throw new Error("Invalid GitLab issue URL");
	const path = match[2] ?? "";
	const issue = /^(\/.*)\/-\/issues\/([1-9]\d*)\/?$/.exec(path);
	if (
		!issue ||
		!Number.isSafeInteger(issueNumber) ||
		Number(issue[2]) !== issueNumber
	)
		throw new Error("Invalid GitLab issue identity");
	const segments = (issue[1] ?? "")
		.slice(1)
		.split("/")

		.map((segment) => {
			let shadow = segment;
			for (let round = 0; round < 8; round++) {
				if (
					!shadow ||
					shadow === "." ||
					shadow === ".." ||
					/[/\\\s]/.test(shadow) ||
					[...shadow].some(
						(character) =>
							character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
					)
				)
					throw new Error("Invalid GitLab project path");
				let next: string;
				try {
					next = decodeURIComponent(shadow);
				} catch {
					if (round === 0) throw new Error("Invalid GitLab project path");
					break;
				}
				if (next === shadow) break;
				shadow = next;
				if (round === 7) throw new Error("Invalid GitLab project path");
			}
			return decodeURIComponent(segment);
		});
	if (segments.length < 2) throw new Error("Invalid GitLab project path");
	const url = new URL(raw);
	return {
		url: `https://${url.host}${url.pathname.replace(/\/$/, "")}`,
		host: url.host,
		path: segments.join("/"),
	};
}

function assertIssueRemote(
	expected: ReturnType<typeof parseIssueUrl>,
	remote: ParsedRemote,
	issueNumber: number,
) {
	const selected = parseIssueUrl(
		`${remote.url}/-/issues/${issueNumber}`,
		issueNumber,
	);
	if (
		remote.provider === "github" ||
		expected.host !== selected.host ||
		expected.path !== selected.path
	)
		throw new Error("GitLab issue does not match selected repository");
}

async function getGithubIssueContent(
	ctx: HostServiceContext,
	input: z.infer<typeof getContentInputSchema>,
) {
	const repo = await resolveGithubRepo(ctx, input.projectId);
	try {
		const raw = await execGh([
			"issue",
			"view",
			String(input.issueNumber),
			"--repo",
			`${repo.owner}/${repo.name}`,
			"--json",
			"number,title,body,url,state,author,createdAt,updatedAt",
		]);
		const data = ghIssueContentSchema.parse(raw);
		return {
			number: data.number,
			title: data.title,
			body: data.body ?? "",
			url: data.url,
			state: data.state.toLowerCase(),
			author: data.author?.login ?? null,
			createdAt: data.createdAt,
			updatedAt: data.updatedAt,
		};
	} catch (err) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to fetch issue #${input.issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
		});
	}
}

export const getContent = protectedProcedure
	.input(getContentInputSchema)
	.query(async ({ ctx, input }) => {
		let expected: ReturnType<typeof parseIssueUrl> | undefined;
		try {
			if (input.expectedIssueUrl !== undefined)
				expected = parseIssueUrl(input.expectedIssueUrl, input.issueNumber);
		} catch (cause) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Invalid GitLab issue reference",
				cause,
			});
		}
		let repo: ResolvedRepo;
		try {
			repo = await resolveRepo(ctx, input.projectId, {
				validateRemote: (remote) => {
					if (!expected) return;
					try {
						assertIssueRemote(expected, remote, input.issueNumber);
					} catch (cause) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "GitLab issue does not match selected repository",
							cause,
						});
					}
				},
			});
		} catch (error) {
			if (
				!expected &&
				error instanceof TRPCError &&
				error.code === "BAD_REQUEST" &&
				error.cause === undefined
			)
				return getGithubIssueContent(ctx, input);
			throw error;
		}
		if (repo.provider !== "gitlab") {
			if (expected)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Selected repository is not GitLab",
				});
			return getGithubIssueContent(ctx, input);
		}
		let selected: ReturnType<typeof parseIssueUrl>;
		try {
			selected = parseIssueUrl(
				`${repo.url}/-/issues/${input.issueNumber}`,
				input.issueNumber,
			);
		} catch (cause) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Invalid GitLab issue reference",
				cause,
			});
		}
		const deps = gitLabApiDeps(ctx.credentials, repo);
		const token = deps.request ? null : await deps.token();
		if (!deps.request && !token)
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "GitLab credentials are unavailable",
			});
		try {
			const client = new GitLabProviderClient({
				...deps,
				token: async () => token,
			});
			const data = gitlabIssueContentSchema.parse(
				await client.fetchIssueContent(repo, input.issueNumber),
			);
			let returned: ReturnType<typeof parseIssueUrl>;
			try {
				returned = parseIssueUrl(data.url, data.number);
			} catch (cause) {
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: "GitLab returned an invalid issue reference",
					cause,
				});
			}
			if (
				data.number !== input.issueNumber ||
				returned.host !== selected.host ||
				returned.path !== selected.path
			)
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: "GitLab returned a different issue",
				});
			return {
				...data,
				url: returned.url,
				state: data.state === "opened" ? "open" : data.state,
				provider: "gitlab" as const,
				expectedIssueUrl: expected?.url ?? selected.url,
			};
		} catch (cause) {
			if (cause instanceof TRPCError) throw cause;
			const status = cause instanceof GitLabRestError ? cause.status : 503;
			const code =
				status === 401
					? "UNAUTHORIZED"
					: status === 403
						? "FORBIDDEN"
						: status === 404
							? "NOT_FOUND"
							: status === 429
								? "TOO_MANY_REQUESTS"
								: status >= 500
									? "SERVICE_UNAVAILABLE"
									: "BAD_REQUEST";
			throw new TRPCError({
				code,
				message: "Unable to fetch GitLab issue content",
				cause,
			});
		}
	});
