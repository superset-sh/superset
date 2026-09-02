import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolvePageId } from "../../pageId";
import { agentSessionId } from "../agentSession";

interface ThreadComment {
	authorName: string;
	authorKind: string;
	body: string;
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
			const pages = await ctx.api.page.list.query(
				options.workspace ? { workspaceId: options.workspace } : undefined,
			);
			const perPage = await mapWithConcurrency(pages, 8, async (page) => {
				const rows = (await ctx.api.pageComment.list.query({
					pageId: page.id,
					...activatedOnly,
				})) as unknown as Thread[];
				return rows.map((row) => ({
					...row,
					pageTitle: page.title,
					pageSlug: page.slug,
				}));
			});
			threads = perPage
				.flat()
				.sort((a, b) => stamp(a.createdAt) - stamp(b.createdAt));
		}

		if (options.unresolved) {
			threads = threads.filter((thread) => !thread.resolved);
		}

		if (!options.threadId) return threads;

		const match = threads.filter((thread) => thread.id === options.threadId);
		if (match.length === 0) {
			throw new CLIError(
				`No thread ${options.threadId} found`,
				"Run without --threadId to see every thread",
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
				}
				return lines.join("\n");
			})
			.join("\n\n");
	},
});

function stamp(value: string | Date): number {
	return value instanceof Date ? value.getTime() : Date.parse(value);
}

async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	work: (item: T) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (next < items.length) {
				const index = next++;
				results[index] = await work(items[index] as T);
			}
		},
	);
	await Promise.all(workers);
	return results;
}

function indent(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line, index) => (index === 0 ? line : `${prefix}${line}`))
		.join("\n");
}
