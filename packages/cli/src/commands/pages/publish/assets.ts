import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { parse } from "node-html-parser";

// Static references only: HTML that builds a path at runtime is invisible here.
// `srcset` is handled separately — it is a list of "url descriptor" pairs.
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

const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

export interface AssetReference {
	/** Exactly as written in the HTML, e.g. "./logo.png?v=2". */
	reference: string;
	absolutePath: string;
}

// `rootDir` is the containment boundary — the workspace root, not the HTML's own
// directory, so `../shared/logo.png` works while `../../../.ssh/id_rsa` does not.
function resolveLocalReference(
	reference: string,
	baseDir: string,
	rootDir: string,
): string | null {
	const trimmed = reference.trim();
	if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
		return null;
	}
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
	if (!existsSync(absolute)) return null;

	// Both sides canonicalized: `resolve` is lexical, and rootDir is often
	// behind a symlink itself.
	let real: string;
	let realRoot: string;
	try {
		real = realpathSync(absolute);
		realRoot = realpathSync(rootDir);
	} catch {
		return null;
	}

	const withinRoot = relative(realRoot, real);
	if (withinRoot.startsWith("..") || isAbsolute(withinRoot)) return null;

	if (!statSync(real).isFile()) return null;
	return real;
}

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
	rootDir: string,
	visit: (reference: string, absolutePath: string) => string | undefined,
): string {
	const root = parse(html, {
		comment: true,
		blockTextElements: { script: true, style: true, pre: true, code: true },
	});

	const apply = (reference: string): string | undefined => {
		const absolutePath = resolveLocalReference(reference, baseDir, rootDir);
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

export function collectAssetReferences(
	html: string,
	htmlPath: string,
	rootDir?: string,
): AssetReference[] {
	const baseDir = dirname(resolve(htmlPath));
	const found = new Map<string, AssetReference>();
	eachReference(
		html,
		baseDir,
		rootDir ?? baseDir,
		(reference, absolutePath) => {
			found.set(reference, { reference, absolutePath });
			return undefined;
		},
	);
	return [...found.values()];
}

// Parsed rather than string-substituted, so the same path written in body text
// is left alone.
export function rewriteAssetReferences(
	html: string,
	htmlPath: string,
	urlByReference: Map<string, string>,
	rootDir?: string,
): string {
	const baseDir = dirname(resolve(htmlPath));
	return eachReference(html, baseDir, rootDir ?? baseDir, (reference) =>
		urlByReference.get(reference),
	);
}
