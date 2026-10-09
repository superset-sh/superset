import type { ComposerChip } from "@superset/chat-ui/PromptInput";

export const LEADING_COMMAND = /^\/([\w:-]+)(?=\s|$)/;

export function commandLabel(name: string): string {
	const base = name
		.slice(name.lastIndexOf(":") + 1)
		.replace(/[-_]+/g, " ")
		.trim();
	return base ? `${base[0]?.toUpperCase()}${base.slice(1)}` : name;
}

export function commandChip(
	name: string,
	description?: string | undefined,
): ComposerChip {
	return {
		label: commandLabel(name),
		serialized: `/${name}`,
		...(description ? { description } : {}),
		data: { elementKind: "slash_command" },
	};
}
