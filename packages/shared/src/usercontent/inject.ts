export const RUNTIME_SCRIPT_PATH = "/_superset/runtime.js";

/**
 * The origin's one edit to a published document: a same-origin script tag
 * before `</body>` (or appended when there is none), so the runtime can
 * change without republishing anything.
 */
export function injectScriptTag(html: string, src: string): string {
	const tag = `<script src="${src}"></script>`;
	const close = html.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
	if (close === -1) return html + tag;
	return html.slice(0, close) + tag + html.slice(close);
}

/**
 * A `<head>` written inside a comment or a raw-text element is text, not a
 * tag: injecting there would park the stylesheet somewhere the browser never
 * reads. Walk the document skipping those spans, and take the first real one.
 */
const HEAD_OR_SKIP =
	/<!--|<(script|style|textarea|title)(?=[\s/>])|<head(?=[\s>])[^>]*>/gi;

function findHeadTag(html: string): { index: number; length: number } | null {
	HEAD_OR_SKIP.lastIndex = 0;
	let match = HEAD_OR_SKIP.exec(html);
	while (match) {
		if (match[0].startsWith("<!--")) {
			const end = html.indexOf("-->", match.index + 4);
			if (end === -1) return null;
			HEAD_OR_SKIP.lastIndex = end + 3;
		} else if (match[1]) {
			const close = new RegExp(`</${match[1]}\\s*>`, "i").exec(
				html.slice(match.index),
			);
			if (!close) return null;
			HEAD_OR_SKIP.lastIndex = match.index + close.index + close[0].length;
		} else {
			return { index: match.index, length: match[0].length };
		}
		match = HEAD_OR_SKIP.exec(html);
	}
	return null;
}

export function injectStylesheetLink(html: string, href: string): string {
	const tag = `<link rel="stylesheet" href="${href}">`;
	const head = findHeadTag(html);
	if (head) {
		const at = head.index + head.length;
		return html.slice(0, at) + tag + html.slice(at);
	}
	const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
	if (doctype) {
		const at = doctype[0].length;
		return html.slice(0, at) + tag + html.slice(at);
	}
	return tag + html;
}
