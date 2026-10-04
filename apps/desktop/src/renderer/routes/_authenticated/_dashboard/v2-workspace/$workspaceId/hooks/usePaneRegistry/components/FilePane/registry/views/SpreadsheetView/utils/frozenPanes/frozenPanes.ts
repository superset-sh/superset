import type { FrozenPane } from "../../types";

export const NO_FREEZE: FrozenPane = { rows: 0, cols: 0 };

/** Entries of the workbook archive, as SheetJS returns them with `bookFiles`. */
export type ArchiveFiles = Record<string, { content?: ArrayLike<number> }>;

const HEAD_BYTES = 64 * 1024;
const FROZEN_STATES = new Set(["frozen", "frozenSplit"]);
const OFFICE_DOCUMENT = /\/officeDocument$/;
const DEFAULT_WORKBOOK = "xl/workbook.xml";
// settings.xml split mode of a frozen pane; 1 is a plain split.
const OPEN_DOCUMENT_FROZEN = "2";
const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

function unescapeXml(value: string): string {
	return value.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name: string) => {
		if (name[0] !== "#") return ENTITIES[name] ?? entity;
		const code =
			name[1] === "x" || name[1] === "X"
				? Number.parseInt(name.slice(2), 16)
				: Number.parseInt(name.slice(1), 10);
		return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
	});
}

function attributes(tag: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
		const [, name, , value] = match;
		if (name !== undefined && value !== undefined) {
			result[name] = unescapeXml(value);
		}
	}
	return result;
}

/** The value of an attribute whatever its namespace prefix. */
function localAttribute(
	attrs: Record<string, string>,
	name: string,
): string | undefined {
	return Object.entries(attrs).find(
		([key]) => key === name || key.endsWith(`:${name}`),
	)?.[1];
}

function count(value: string | undefined): number {
	const parsed = Math.floor(Number(value));
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Frozen rows and columns of the first sheet view of a worksheet part. */
export function parseFrozenPane(sheetXml: string): FrozenPane {
	const open = /<(?:\w+:)?sheetView\b[^>]*>/.exec(sheetXml);
	if (!open || open[0].endsWith("/>")) return NO_FREEZE;
	const close = sheetXml.slice(open.index).search(/<\/(?:\w+:)?sheetView>/);
	const view = sheetXml.slice(
		open.index,
		close === -1 ? undefined : open.index + close,
	);
	const pane = /<(?:\w+:)?pane\b[^>]*>/.exec(view);
	if (!pane) return NO_FREEZE;
	const attrs = attributes(pane[0]);
	if (!FROZEN_STATES.has(attrs.state ?? "")) return NO_FREEZE;
	return { rows: count(attrs.ySplit), cols: count(attrs.xSplit) };
}

function decode(content: ArrayLike<number> | undefined, limit?: number) {
	if (!content) return "";
	const bytes =
		content instanceof Uint8Array ? content : Uint8Array.from(content);
	return new TextDecoder().decode(
		limit === undefined ? bytes : bytes.subarray(0, limit),
	);
}

function relationships(xml: string): Array<Record<string, string>> {
	return (xml.match(/<(?:\w+:)?Relationship\b[^>]*>/g) ?? []).map(attributes);
}

/** A relationship target, resolved from the folder of the part that names it. */
function resolvePart(base: string, target: string): string {
	const segments = target.startsWith("/")
		? []
		: base.split("/").slice(0, -1).filter(Boolean);
	for (const segment of target.split("/")) {
		if (segment === "..") segments.pop();
		else if (segment && segment !== ".") segments.push(segment);
	}
	return segments.join("/");
}

function relsPath(part: string): string {
	const slash = part.lastIndexOf("/");
	return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

/**
 * Frozen panes of each sheet of an xlsx/xlsm archive, in workbook order.
 * The binary parts of .xlsb are not read.
 */
export function readFrozenPanes(files: ArchiveFiles | undefined): FrozenPane[] {
	if (!files) return [];
	const root = relationships(decode(files["_rels/.rels"]?.content)).find(
		(rel) => OFFICE_DOCUMENT.test(rel.Type ?? ""),
	)?.Target;
	const workbookPath = root ? resolvePart("", root) : DEFAULT_WORKBOOK;
	if (!workbookPath.endsWith(".xml")) return [];
	const workbook = decode(files[workbookPath]?.content);
	if (!workbook) return [];
	const targets = new Map<string, string>();
	for (const { Id, Target } of relationships(
		decode(files[relsPath(workbookPath)]?.content),
	)) {
		if (Id && Target) targets.set(Id, resolvePart(workbookPath, Target));
	}
	const sheets = workbook.match(/<(?:\w+:)?sheet\b[^>]*>/g) ?? [];
	return sheets.map((tag) => {
		const id = localAttribute(attributes(tag), "id");
		const path = id ? targets.get(id) : undefined;
		const head = decode(path ? files[path]?.content : undefined, HEAD_BYTES);
		const dataStart = head.search(/<(?:\w+:)?sheetData\b/);
		return parseFrozenPane(dataStart === -1 ? head : head.slice(0, dataStart));
	});
}

/**
 * Frozen panes of the named sheets, from the first view of an OpenDocument
 * settings.xml. The horizontal split freezes columns, the vertical one rows.
 */
export function parseOpenDocumentFrozenPanes(
	settingsXml: string,
	sheetNames: string[],
): FrozenPane[] {
	const byName = openDocumentPanesByName(settingsXml);
	// SheetJS keeps the XML entities of OpenDocument sheet names.
	return sheetNames.map(
		(name) => byName.get(name) ?? byName.get(unescapeXml(name)) ?? NO_FREEZE,
	);
}

function openDocumentPanesByName(settingsXml: string): Map<string, FrozenPane> {
	const result = new Map<string, FrozenPane>();
	const tables =
		/<(?:\w+:)?config-item-map-named\b[^>]*\bname\s*=\s*(["'])Tables\1[^>]*>/.exec(
			settingsXml,
		);
	if (!tables) return result;
	const rest = settingsXml.slice(tables.index + tables[0].length);
	const end = rest.search(/<\/(?:\w+:)?config-item-map-named>/);
	const body = end === -1 ? rest : rest.slice(0, end);
	const entries = body.matchAll(
		/<(?:\w+:)?config-item-map-entry\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?config-item-map-entry>/g,
	);
	for (const [, tag = "", content = ""] of entries) {
		const name = localAttribute(attributes(tag), "name");
		if (name === undefined) continue;
		const items = new Map<string, string>();
		for (const [, itemTag = "", value = ""] of content.matchAll(
			/<(?:\w+:)?config-item\b([^>]*)>([^<]*)</g,
		)) {
			const itemName = localAttribute(attributes(itemTag), "name");
			if (itemName) items.set(itemName, value.trim());
		}
		const frozen = (mode: string, position: string) =>
			items.get(mode) === OPEN_DOCUMENT_FROZEN ? count(items.get(position)) : 0;
		result.set(name, {
			rows: frozen("VerticalSplitMode", "VerticalSplitPosition"),
			cols: frozen("HorizontalSplitMode", "HorizontalSplitPosition"),
		});
	}
	return result;
}
