import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolvePageId } from "../../pageId";
import { agentSessionId } from "../agentSession";

interface ThreadComment {
	authorName: string;
	authorKind: string;
	body: string;
	attachments?: { name: string; url: string }[];
	createdAt: string | Date;
}

interface Thread {
	id: string;
	anchor: { path: string; tag: string } | null;
	anchorText: string | null;
	resolved: boolean;
	createdAt: string | Date;
	comments: ThreadComment[];
	pageTitle?: string;
	pageSlug?: string;
}

export default command({
	description: "List comment threads on a page, oldest first",
	options: {
		page: string()
			.alias("pageId")
			.desc("Page id or slug (omit to sweep every page you can see)"),
		threadId: string().alias("thread").desc("Show only this thread"),
		unresolved: boolean()
			.alias("open")
			.desc("Show only threads that are still open"),
		workspace: string().desc(
			"With no --page, only sweep this workspace's pages",
		),
	},
	run: async ({ ctx, options }) => {
		const activatedOnly = agentSessionId() ? { activatedOnly: true } : {};

		let threads: Thread[];
		if (options.page) {
			const pageId = await resolvePageId(ctx, options.page);
			threads = (await ctx.api.pageComment.list.query({
				pageId,
				...activatedOnly,
			})) as unknown as Thread[];
		} else {
			// One org-scoped query. Asking page by page was a call per page in the
			// organization, and it grew with the org rather than with the comments.
			threads = (await ctx.api.pageComment.listForOrganization.query({
				...(options.workspace ? { workspaceId: options.workspace } : {}),
				...activatedOnly,
				...(options.unresolved ? { unresolvedOnly: true } : {}),
			})) as unknown as Thread[];
		}

		if (options.unresolved) {
			threads = threads.filter((thread) => !thread.resolved);
		}

		if (!options.threadId) return threads;

		const match = threads.filter((thread) => thread.id === options.threadId);
		if (match.length === 0) {
			throw new CLIError(
				`No thread ${options.threadId} found`,
				"Run without --thread to see every thread",
			);
		}
		return match;
	},
	display: (data) => {
		const threads = data as Thread[];
		if (threads.length === 0) return "No comments found.";

		return threads
			.map((thread) => {
				const where = thread.anchor
					? `<${thread.anchor.tag}> ${thread.anchor.path || "body"}`
					: "whole page";
				const lines = [
					`${thread.id}  ${thread.resolved ? "resolved" : "open"}  ${where}`,
				];
				if (thread.pageSlug) {
					lines.push(`  page: ${thread.pageTitle} (${thread.pageSlug})`);
				}
				if (thread.anchorText) {
					lines.push(`  text: ${JSON.stringify(thread.anchorText)}`);
				}
				for (const comment of thread.comments) {
					const who =
						comment.authorKind === "agent"
							? `${comment.authorName} (agent)`
							: comment.authorName;
					lines.push(`  ${who}: ${indent(comment.body, "    ")}`);
					for (const attachment of comment.attachments ?? []) {
						lines.push(`    [image ${attachment.name}] ${attachment.url}`);
					}
				}
				return lines.join("\n");
			})
			.join("\n\n");
	},
});

function indent(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line, index) => (index === 0 ? line : `${prefix}${line}`))
		.join("\n");
}
