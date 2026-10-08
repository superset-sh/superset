import { parsePatchFiles } from "@pierre/diffs";
import type { ReactNode } from "react";

const LANGUAGE_CLASS = /(?:^|\s)language-([^\s]+)/;

/** What a fenced block was marked as, or null for an unmarked fence. */
export function fenceLanguage(className: unknown): string | null {
	if (typeof className !== "string") return null;
	const match = LANGUAGE_CLASS.exec(className);
	return match?.[1]?.toLowerCase() ?? null;
}

/** The fence's text, without the newline markdown leaves at the end. */
export function fenceText(children: ReactNode): string {
	const collect = (node: ReactNode): string => {
		if (typeof node === "string") return node;
		if (typeof node === "number") return String(node);
		if (Array.isArray(node)) return node.map(collect).join("");
		return "";
	};
	return collect(children).replace(/\n$/, "");
}

const DIFF_LANGUAGES = new Set(["diff", "patch", "udiff"]);

export function isDiffLanguage(language: string | null): boolean {
	return language !== null && DIFF_LANGUAGES.has(language);
}

/**
 * Whether the text is a patch the patch view can show: it renders exactly one
 * file and throws on any other count, so a fence holding a whole `git diff`
 * goes to the plain code view instead.
 */
export function isSingleFilePatch(text: string): boolean {
	try {
		const patches = parsePatchFiles(text);
		if (patches.length !== 1) return false;
		const files = patches[0]?.files ?? [];
		return files.length === 1 && (files[0]?.hunks.length ?? 0) > 0;
	} catch {
		return false;
	}
}
