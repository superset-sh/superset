import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "prosemirror-markdown";

/**
 * LaTeX support for the markdown preview.
 *
 * `@tiptap/extension-mathematics` describes its markdown behaviour with the
 * `parseMarkdown`/`renderMarkdown`/`markdownTokenizer` node spec keys, which are
 * Tiptap's own markdown API. The preview renders through `tiptap-markdown`,
 * which instead reads a `storage.markdown` spec per node: a `parse.setup(md)`
 * hook to register markdown-it rules, and a `serialize` function. Without that
 * spec the math nodes parse from HTML only, so `$x$` in a markdown file stays
 * literal text. The two nodes below attach it.
 */

/** The slice of markdown-it the math rules touch. It is a transitive dependency. */
interface MarkdownItState {
	src: string;
	pos: number;
	push: (type: string, tag: string, nesting: number) => MarkdownItToken;
	bMarks: number[];
	eMarks: number[];
	tShift: number[];
	line: number;
}

interface MarkdownItToken {
	content: string;
	markup: string;
	block?: boolean;
	map?: [number, number];
}

interface MarkdownIt {
	block: {
		ruler: {
			before: (beforeName: string, name: string, rule: unknown) => void;
		};
	};
	inline: {
		ruler: {
			before: (beforeName: string, name: string, rule: unknown) => void;
		};
	};
	renderer: {
		rules: Record<string, (tokens: MarkdownItToken[], idx: number) => string>;
	};
}

/**
 * KaTeX ignores a math span whose content starts or ends with whitespace, and
 * `$5` is a price rather than math. A price range reads the same way: `$5-$10`
 * hands the rule `5-`, the first half of the range, so a numeric span ending in
 * a dash is not math either. Mirrored here so markdown-it gates on the same
 * reading of the delimiters.
 */
function isMathContent(latex: string): boolean {
	if (latex.length === 0 || /^\s/.test(latex) || /\s$/.test(latex)) {
		return false;
	}
	return !/^\d+$/.test(latex) && !/^[\d.,]+[-–—]$/.test(latex);
}

function closingDelimiter(src: string, from: number): number {
	for (let index = from; index < src.length; index++) {
		if (src[index] === "$" && src[index - 1] !== "\\") {
			return index;
		}
	}
	return -1;
}

/**
 * A display block closes on `$$` only when nothing but whitespace follows it on
 * that line. A `$$` with text after it is not a closing delimiter, and taking it
 * for one would consume that text: the preview would drop it and the serializer
 * has no way to write it back.
 */
function closingBlockDelimiter(line: string): number {
	const closing = line.indexOf("$$");
	if (closing < 0) {
		return -1;
	}
	return /^\s*$/.test(line.slice(closing + 2)) ? closing : -1;
}

function inlineMathRule(state: MarkdownItState, silent: boolean): boolean {
	const { src } = state;
	if (src[state.pos] !== "$" || src[state.pos + 1] === "$") {
		return false;
	}

	const end = closingDelimiter(src, state.pos + 1);
	if (end < 0) {
		return false;
	}

	const latex = src.slice(state.pos + 1, end);
	if (!isMathContent(latex)) {
		return false;
	}

	if (!silent) {
		const token = state.push("math_inline", "math", 0);
		token.content = latex;
		token.markup = "$";
	}

	state.pos = end + 1;
	return true;
}

function blockMathRule(
	state: MarkdownItState,
	startLine: number,
	endLine: number,
	silent: boolean,
): boolean {
	const start = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
	if (state.src.slice(start, start + 2) !== "$$") {
		return false;
	}
	if (silent) {
		return true;
	}

	const firstLine = state.src.slice(start + 2, state.eMarks[startLine] ?? 0);
	const closingOnFirstLine = closingBlockDelimiter(firstLine);
	const lines = [firstLine];
	let closingLine = startLine;
	if (closingOnFirstLine >= 0) {
		lines[0] = firstLine.slice(0, closingOnFirstLine);
	} else if (firstLine.includes("$$")) {
		// The first line holds a `$$` with text after it, so this block has no
		// closer of its own; a later line is not one, and reading it as the
		// closer would swallow the text.
		return false;
	} else {
		closingLine = -1;
		for (let line = startLine + 1; line < endLine; line++) {
			const lineStart = (state.bMarks[line] ?? 0) + (state.tShift[line] ?? 0);
			const text = state.src.slice(lineStart, state.eMarks[line] ?? 0);
			const closing = closingBlockDelimiter(text);
			if (closing >= 0) {
				lines.push(text.slice(0, closing));
				closingLine = line;
				break;
			}
			lines.push(text);
		}
		if (closingLine < 0) {
			return false;
		}
	}

	const latex = lines.join("\n").trim();
	if (latex.length === 0) {
		return false;
	}

	const token = state.push("math_block", "math", 0);
	token.block = true;
	token.content = latex;
	token.markup = "$$";
	token.map = [startLine, closingLine + 1];
	state.line = closingLine + 1;
	return true;
}

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** markdown-it renders to HTML, which is what the editor parses from. */
const configuredParsers = new WeakSet<object>();

function registerMathRules(this: unknown, md: MarkdownIt): void {
	if (configuredParsers.has(md)) {
		return;
	}
	configuredParsers.add(md);

	md.inline.ruler.before("escape", "math_inline", inlineMathRule);
	md.block.ruler.before("fence", "math_block", blockMathRule);
	md.renderer.rules.math_inline = (tokens, idx) =>
		`<span data-type="inline-math" data-latex="${escapeAttribute(
			tokens[idx]?.content ?? "",
		)}"></span>`;
	md.renderer.rules.math_block = (tokens, idx) =>
		`<div data-type="block-math" data-latex="${escapeAttribute(
			tokens[idx]?.content ?? "",
		)}"></div>\n`;
}

function serializeInlineMath(
	state: MarkdownSerializerState,
	node: ProseMirrorNode,
): void {
	state.write(`$${String(node.attrs.latex ?? "")}$`);
}

function serializeBlockMath(
	state: MarkdownSerializerState,
	node: ProseMirrorNode,
): void {
	state.write(`$$\n${String(node.attrs.latex ?? "")}\n$$`);
	state.closeBlock(node);
}

export const MarkdownInlineMath = InlineMath.extend({
	addStorage() {
		return {
			...this.parent?.(),
			markdown: {
				parse: { setup: registerMathRules },
				serialize: serializeInlineMath,
			},
		};
	},
});

export const MarkdownBlockMath = BlockMath.extend({
	addStorage() {
		return {
			...this.parent?.(),
			markdown: {
				parse: { setup: registerMathRules },
				serialize: serializeBlockMath,
			},
		};
	},
});
