export interface FileHref {
	path: string;
	row?: number;
	col?: number;
}

const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LINE_ANCHOR = /#L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?$/;
const LINE_SUFFIX = /:(\d+)(?::(\d+))?$/;

export function parseFileHref(href: string): FileHref | null {
	let rest = href.trim();
	if (rest.startsWith("file://")) {
		rest = rest.slice("file://".length);
	} else if (rest === "" || rest.startsWith("#") || OTHER_SCHEME.test(rest)) {
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
