import type { CommentThread } from "@superset/ui/page-comments";

export function buildPrompt(
	pageTitle: string,
	pageSlug: string,
	threads: CommentThread[],
): string {
	const lines = [
		`There are ${threads.length} unresolved comment${threads.length === 1 ? "" : "s"} on the published page "${pageTitle}" (slug: ${pageSlug}). Address each one in the source this page was published from.`,
		"",
		"Each comment is anchored to one element. `at` is a CSS selector path from <body> in the published HTML, and `text` is what that element contained when the comment was written (truncated).",
		"",
	];
	threads.forEach((thread, index) => {
		const { path, tag, text } = thread.anchor;
		lines.push(`${index + 1}. <${tag}> at: ${path || "body"}`);
		lines.push(`   thread: ${thread.id}`);
		if (text) lines.push(`   text: ${JSON.stringify(text)}`);
		for (const comment of thread.comments) {
			lines.push(
				`   ${JSON.stringify(comment.authorName)}: ${JSON.stringify(comment.body)}`,
			);
		}
		lines.push("");
	});
	lines.push(
		"When you have addressed one, answer it and close it, in that order:",
		"",
		'  superset pages comments reply --threadId <id> "<what you changed>"',
		"  superset pages comments resolve --threadId <id>",
		"",
		"Only act on the thread ids listed above. To re-read them: `superset pages comments list --page " +
			pageSlug +
			"`.",
	);
	return lines.join("\n");
}
