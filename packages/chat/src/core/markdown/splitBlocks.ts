import { Lexer } from "marked";

export function splitBlocks(markdown: string): string[] {
	if (markdown === "") return [];
	const tokens = new Lexer({ gfm: true }).lex(markdown);
	const blocks: string[] = [];
	for (const token of tokens) {
		if (token.raw === "") continue;
		blocks.push(token.raw);
	}
	return blocks;
}

export type SplitForStreaming = {
	stable: string[];
	tail: string;
};

export function splitForStreaming(markdown: string): SplitForStreaming {
	const blocks = splitBlocks(markdown);
	if (blocks.length === 0) return { stable: [], tail: "" };
	return {
		stable: blocks.slice(0, -1),
		tail: blocks[blocks.length - 1] as string,
	};
}
