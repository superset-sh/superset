const MENTION_REGEX = /(^|[\s([{"'`])@([^\s@]+)/g;

const TRAILING_PUNCTUATION = /[.,!?;:)\]}]+$/;

export type UserMentionSegment =
	| { type: "text"; value: string }
	| { type: "file-mention"; raw: string; relativePath: string }
	| { type: "task-mention"; raw: string; slug: string };

function trimTrailingPunctuation(value: string): string {
	return value.replace(TRAILING_PUNCTUATION, "");
}

const TASK_MENTION_PREFIX = "task:";

function isTaskMention(value: string): boolean {
	return (
		value.startsWith(TASK_MENTION_PREFIX) &&
		value.length > TASK_MENTION_PREFIX.length
	);
}

function isFileLikeMention(value: string): boolean {
	if (!value) return false;
	if (value.includes(":")) return false;
	return value.includes("/") || value.includes("\\") || value.includes(".");
}

export function parseUserMentions(text: string): UserMentionSegment[] {
	if (!text) return [{ type: "text", value: "" }];

	const segments: UserMentionSegment[] = [];
	let cursor = 0;

	for (const match of text.matchAll(MENTION_REGEX)) {
		const fullMatch = match[0];
		const boundary = match[1] ?? "";
		const mentionToken = match[2] ?? "";
		const fullMatchIndex = match.index ?? -1;
		if (fullMatchIndex < 0) continue;

		const mentionStart = fullMatchIndex + boundary.length;
		const normalizedToken = trimTrailingPunctuation(mentionToken);
		const isTask = isTaskMention(normalizedToken);
		if (!isTask && !isFileLikeMention(normalizedToken)) {
			continue;
		}

		const mentionText = `@${normalizedToken}`;
		const mentionEnd = mentionStart + mentionText.length;
		if (mentionStart < cursor || mentionEnd > text.length) {
			continue;
		}

		if (mentionStart > cursor) {
			segments.push({
				type: "text",
				value: text.slice(cursor, mentionStart),
			});
		}
		if (isTask) {
			segments.push({
				type: "task-mention",
				raw: mentionText,
				slug: normalizedToken.slice(TASK_MENTION_PREFIX.length),
			});
		} else {
			segments.push({
				type: "file-mention",
				raw: mentionText,
				relativePath: normalizedToken,
			});
		}
		cursor = mentionEnd;

		// Guard against pathological regex behavior in zero-length matches.
		if (fullMatch.length === 0) break;
	}

	if (cursor < text.length) {
		segments.push({
			type: "text",
			value: text.slice(cursor),
		});
	}

	if (segments.length === 0) {
		return [{ type: "text", value: text }];
	}

	return segments;
}
