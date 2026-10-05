import type { ToolCall, ToolKind } from "@superset/chat/protocol";

const TIE_ORDER: readonly ToolKind[] = [
	"edit",
	"delete",
	"move",
	"execute",
	"read",
	"search",
	"fetch",
	"think",
	"other",
];

/** Ties go to the kind that changes more. */
export function dominantKind(items: readonly ToolCall[]): ToolKind {
	const counts = new Map<ToolKind, number>();
	for (const item of items) {
		counts.set(item.toolKind, (counts.get(item.toolKind) ?? 0) + 1);
	}
	let best: ToolKind = "other";
	let bestCount = 0;
	for (const kind of TIE_ORDER) {
		const count = counts.get(kind) ?? 0;
		if (count > bestCount) {
			best = kind;
			bestCount = count;
		}
	}
	return best;
}
