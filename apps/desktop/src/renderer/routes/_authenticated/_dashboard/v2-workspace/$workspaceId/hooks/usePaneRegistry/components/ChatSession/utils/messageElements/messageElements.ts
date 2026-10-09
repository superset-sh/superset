import type { TextElement } from "@superset/chat/protocol";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function elementKindOf(chip: ComposerChip): TextElement["elementKind"] {
	const kind = (chip.data as { elementKind?: unknown } | undefined)
		?.elementKind;
	return kind === "file_mention" || kind === "slash_command" ? kind : "other";
}

export function elementsForChips(
	text: string,
	chips: readonly ComposerChip[],
): TextElement[] {
	const elements: TextElement[] = [];
	let cursor = 0;
	for (const chip of chips) {
		const start = text.indexOf(chip.serialized, cursor);
		if (start === -1) continue;
		cursor = start + chip.serialized.length;
		const byteStart = encoder.encode(text.slice(0, start)).length;
		elements.push({
			byteRange: {
				start: byteStart,
				end: byteStart + encoder.encode(chip.serialized).length,
			},
			elementKind: elementKindOf(chip),
			label: chip.label,
		});
	}
	return elements;
}

export type MessageSegment =
	| { text: string; element?: undefined }
	| { text: string; element: TextElement };

export function splitByElements(
	text: string,
	elements: readonly TextElement[] | undefined,
): MessageSegment[] {
	if (!elements?.length) return [{ text }];
	const bytes = encoder.encode(text);
	const segments: MessageSegment[] = [];
	let cursor = 0;
	for (const element of [...elements].sort(
		(a, b) => a.byteRange.start - b.byteRange.start,
	)) {
		const { start, end } = element.byteRange;
		if (start < cursor || end > bytes.length || end <= start) continue;
		if (start > cursor)
			segments.push({ text: decoder.decode(bytes.slice(cursor, start)) });
		segments.push({ text: decoder.decode(bytes.slice(start, end)), element });
		cursor = end;
	}
	if (cursor < bytes.length)
		segments.push({ text: decoder.decode(bytes.slice(cursor)) });
	return segments;
}
