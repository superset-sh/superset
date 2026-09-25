import type { PromptInputCommand } from "../../types";

function termScore(candidate: string, query: string): number {
	const lowered = candidate.toLowerCase();
	if (lowered.startsWith(query)) return 2;
	if (lowered.includes(query)) return 1;
	return 0;
}

function commandScore(command: PromptInputCommand, query: string): number {
	return Math.max(
		termScore(command.title, query),
		termScore(command.id, query),
		...(command.searchAliases ?? []).map((alias) => termScore(alias, query)),
	);
}

export function rankCommands(
	commands: PromptInputCommand[],
	query: string,
): PromptInputCommand[] {
	const trimmed = query.trim().toLowerCase();
	if (trimmed.length === 0) return commands;
	const groupOrder = new Map<string | null, number>();
	for (const command of commands) {
		const group = command.group ?? null;
		if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size);
	}
	return commands
		.map((command) => ({ command, score: commandScore(command, trimmed) }))
		.filter((scored) => scored.score > 0)
		.sort(
			(a, b) =>
				(groupOrder.get(a.command.group ?? null) ?? 0) -
					(groupOrder.get(b.command.group ?? null) ?? 0) ||
				b.score - a.score ||
				a.command.title.localeCompare(b.command.title),
		)
		.map((scored) => scored.command);
}
