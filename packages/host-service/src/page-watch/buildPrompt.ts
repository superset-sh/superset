import type { WatchedThread } from "./types.ts";

// Control characters would reach the PTY verbatim. A body carrying the
// bracketed-paste terminator would close the paste early and land the rest as
// keystrokes.
// biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function quote(text: string): string {
	return text.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

function describeAnchor(thread: WatchedThread): string {
	if (thread.anchor) {
		return `${thread.anchor.tag} at: ${thread.anchor.path}`;
	}
	return "the page as a whole";
}

export function buildWatchPrompt({
	title,
	slug,
	threads,
}: {
	title: string;
	slug: string;
	threads: WatchedThread[];
}): string {
	const lines: string[] = [];
	const plural = threads.length === 1 ? "comment" : "comments";

	lines.push(
		`New ${plural} on your page "${title}" (${slug}). Read each one and decide whether it needs a change, a reply, or neither.`,
		"",
	);

	threads.forEach((thread, index) => {
		lines.push(`${index + 1}. ${describeAnchor(thread)}`);
		lines.push(`   thread: ${thread.id}`);
		if (thread.anchorText) {
			lines.push(`   text: "${quote(thread.anchorText)}"`);
		}
		for (const comment of thread.comments) {
			const who =
				comment.authorKind === "agent"
					? `${comment.authorName} (agent)`
					: comment.authorName;
			lines.push(`   "${who}": "${quote(comment.body)}"`);
		}
		lines.push("");
	});

	lines.push(
		`If you do not already have the source, run: superset pages pull ${slug} > page.html`,
		"Fix the source, republish it, then reply on each thread you addressed:",
		'  superset pages comments reply --threadId <id> "…"',
		"  superset pages comments resolve --threadId <id>",
		"Not every comment needs an answer. Leave anything that does not ask for one, and do not resolve what you did not fix.",
	);

	return lines.join("\n");
}
