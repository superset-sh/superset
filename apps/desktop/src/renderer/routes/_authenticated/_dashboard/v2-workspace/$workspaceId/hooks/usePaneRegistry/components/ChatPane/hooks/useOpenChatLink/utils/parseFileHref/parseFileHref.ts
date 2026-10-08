export interface FileHref {
	path: string;
	row?: number;
	col?: number;
}

const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(?::\d+)?$)/i;
const BROWSER_SCHEME = /^(mailto|tel):/i;
const LINE_ANCHOR = /#L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?$/;
const LINE_SUFFIX = /:(\d+)(?::(\d+))?$/;

export function parseFileHref(href: string): FileHref | null {
	let rest = href.trim();
	if (rest.startsWith("file://")) {
		try {
			const url = new URL(rest);
			if (url.hostname !== "" && url.hostname !== "localhost") return null;
			rest = url.pathname + url.hash;
		} catch {
			return null;
		}
	} else if (
		rest === "" ||
		rest.startsWith("#") ||
		BROWSER_SCHEME.test(rest) ||
		OTHER_SCHEME.test(rest)
	) {
		return null;
	}

	let row: number | undefined;
	let col: number | undefined;
	const anchor = rest.match(LINE_ANCHOR);
	if (anchor) {
		row = Number(anchor[1]);
		col = anchor[2] ? Number(anchor[2]) : undefined;
		rest = rest.slice(0, anchor.index);
	} else {
		const suffix = rest.match(LINE_SUFFIX);
		if (suffix) {
			row = Number(suffix[1]);
			col = suffix[2] ? Number(suffix[2]) : undefined;
			rest = rest.slice(0, suffix.index);
		}
	}
	rest = rest.replace(/[?#].*$/, "");

	let path: string;
	try {
		path = decodeURIComponent(rest);
	} catch {
		path = rest;
	}
	if (path === "") return null;
	return {
		path,
		...(row !== undefined ? { row } : {}),
		...(col !== undefined ? { col } : {}),
	};
}
