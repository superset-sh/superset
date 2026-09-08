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

export function injectStylesheetLink(html: string, href: string): string {
	const tag = `<link rel="stylesheet" href="${href}">`;
	const head = /<head(?=[\s>])[^>]*>/i.exec(html);
	if (head) {
		const at = head.index + head[0].length;
		return html.slice(0, at) + tag + html.slice(at);
	}
	const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
	if (doctype) {
		const at = doctype[0].length;
		return html.slice(0, at) + tag + html.slice(at);
	}
	return tag + html;
}
