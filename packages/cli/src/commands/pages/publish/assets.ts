import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "node-html-parser";

/**
 * Finding the local files a page references, and pointing them somewhere else
 * once they are uploaded.
 *
 * Only *static* references can be found this way. HTML that builds a path at
 * runtime — `"./assets/" + name` — is invisible here and will break once the
 * page is served from another origin. No static rewrite can fix that, so it is
 * a documented limit rather than a bug to chase.
 */

// Attributes that carry a URL, by tag. `srcset` is handled separately: it is a
// comma-separated list of "url descriptor" pairs, not a single reference.
const URL_ATTRIBUTES: Record<string, readonly string[]> = {
	img: ["src"],
	source: ["src"],
	script: ["src"],
	link: ["href"],
	video: ["src", "poster"],
	audio: ["src"],
	embed: ["src"],
	object: ["data"],
	input: ["src"],
};

const SRCSET_TAGS = ["img", "source"] as const;

// `url(...)` inside a <style> block or a style="" attribute.
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

export interface AssetReference {
	/** Exactly as written in the HTML, e.g. "./logo.png?v=2". */
	reference: string;
	/** Where that resolves on disk. */
	absolutePath: string;
}

/**
 * A reference we should upload: relative, and pointing at a file that exists.
 *
 * Absolute URLs, protocol-relative URLs, `data:`, and bare anchors are left
 * alone — they already resolve without us. A relative path with nothing behind
 * it is also left alone rather than turned into a dead link.
 */
function resolveLocalReference(
	reference: string,
	baseDir: string,
): string | null {
	const trimmed = reference.trim();
	if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
		return null;
	}
	// Any scheme at all — http:, https:, data:, blob:, mailto:, tel:.
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;

	// A query or fragment is part of the URL, never part of the filename.
	const pathPart = trimmed.split(/[?#]/)[0];
	if (!pathPart) return null;

	let decoded: string;
	try {
		decoded = decodeURIComponent(pathPart);
	} catch {
		decoded = pathPart;
	}

	const absolute = resolve(baseDir, decoded);
	if (!existsSync(absolute) || !statSync(absolute).isFile()) return null;
	return absolute;
}

/** Each "url descriptor" entry of a srcset, with the descriptor preserved. */
function splitSrcset(value: string): { url: string; descriptor: string }[] {
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [url = "", ...rest] = entry.split(/\s+/);
			return { url, descriptor: rest.join(" ") };
		});
}

function eachReference(
	html: string,
	baseDir: string,
	visit: (reference: string, absolutePath: string) => string | undefined,
): string {
	const root = parse(html, {
		comment: true,
		blockTextElements: { script: true, style: true, pre: true, code: true },
	});

	const apply = (reference: string): string | undefined => {
		const absolutePath = resolveLocalReference(reference, baseDir);
		if (!absolutePath) return undefined;
		return visit(reference, absolutePath);
	};

	for (const [tag, attributes] of Object.entries(URL_ATTRIBUTES)) {
		for (const element of root.querySelectorAll(tag)) {
			for (const attribute of attributes) {
				const value = element.getAttribute(attribute);
				if (!value) continue;
				const replacement = apply(value);
				if (replacement !== undefined) {
					element.setAttribute(attribute, replacement);
				}
			}
		}
	}

	for (const tag of SRCSET_TAGS) {
		for (const element of root.querySelectorAll(tag)) {
			const value = element.getAttribute("srcset");
			if (!value) continue;
			let changed = false;
			const rewritten = splitSrcset(value)
				.map(({ url, descriptor }) => {
					const replacement = apply(url);
					if (replacement !== undefined) changed = true;
					const finalUrl = replacement ?? url;
					return descriptor ? `${finalUrl} ${descriptor}` : finalUrl;
				})
				.join(", ");
			if (changed) element.setAttribute("srcset", rewritten);
		}
	}

	const rewriteCss = (css: string): { text: string; changed: boolean } => {
		let changed = false;
		const text = css.replace(CSS_URL, (match, quote: string, url: string) => {
			const replacement = apply(url);
			if (replacement === undefined) return match;
			changed = true;
			return `url(${quote}${replacement}${quote})`;
		});
		return { text, changed };
	};

	for (const element of root.querySelectorAll("style")) {
		const { text, changed } = rewriteCss(element.innerHTML);
		if (changed) element.set_content(text);
	}

	for (const element of root.querySelectorAll("[style]")) {
		const value = element.getAttribute("style");
		if (!value) continue;
		const { text, changed } = rewriteCss(value);
		if (changed) element.setAttribute("style", text);
	}

	return root.toString();
}

/** Every local file this page references, deduplicated by reference string. */
export function collectAssetReferences(
	html: string,
	htmlPath: string,
): AssetReference[] {
	const baseDir = dirname(resolve(htmlPath));
	const found = new Map<string, AssetReference>();
	eachReference(html, baseDir, (reference, absolutePath) => {
		found.set(reference, { reference, absolutePath });
		return undefined; // discovery only — leave the document untouched
	});
	return [...found.values()];
}

/**
 * Point every reference at its uploaded URL.
 *
 * The document is re-serialized, so attribute quoting may normalise even where
 * nothing changed. That is cosmetic — it does not alter how the page renders —
 * and is the price of rewriting through a parser rather than by string
 * substitution, which would also hit the same path written in body text.
 */
export function rewriteAssetReferences(
	html: string,
	htmlPath: string,
	urlByReference: Map<string, string>,
): string {
	const baseDir = dirname(resolve(htmlPath));
	return eachReference(html, baseDir, (reference) =>
		urlByReference.get(reference),
	);
}
