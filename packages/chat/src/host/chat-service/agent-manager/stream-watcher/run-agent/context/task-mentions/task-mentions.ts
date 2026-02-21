const TASK_MENTION_REGEX = /@task:([\w-]+)/g;

export function parseTaskMentions(text: string): string[] {
	return [
		...new Set(
			[...text.matchAll(TASK_MENTION_REGEX)]
				.map((m) => m[1])
				.filter((s): s is string => s !== undefined),
		),
	];
}
