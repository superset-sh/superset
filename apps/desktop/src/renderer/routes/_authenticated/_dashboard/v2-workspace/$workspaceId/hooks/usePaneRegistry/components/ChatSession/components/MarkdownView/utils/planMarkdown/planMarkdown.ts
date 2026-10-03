import { fenceState, splitForStreaming } from "@superset/chat/core";

export type MarkdownBlockPlan = {
	key: string;
	block: string;
};

export type MarkdownPlan = {
	stable: MarkdownBlockPlan[];
	tail: string | null;
	tailFenceOpen: boolean;
};

export function planMarkdown(text: string): MarkdownPlan {
	const { stable, tail } = splitForStreaming(text);
	let offset = 0;
	const keyed = stable.map((block) => {
		const key = `${offset}`;
		offset += block.length;
		return { key, block };
	});
	if (tail === "") return { stable: keyed, tail: null, tailFenceOpen: false };
	return { stable: keyed, tail, tailFenceOpen: fenceState(text).open };
}
