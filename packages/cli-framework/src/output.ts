export type OutputFlags = {
	json: boolean;
	quiet: boolean;
};

export function formatOutput(
	result: unknown,
	display: ((data: unknown) => string) | undefined,
	flags: OutputFlags,
): string {
	const data = isResultWithData(result) ? result.data : result;
	const message = isResultWithMessage(result) ? result.message : undefined;

	if (flags.json) {
		return JSON.stringify(data, null, 2);
	}

	if (flags.quiet) {
		return extractIds(data);
	}

	if (display) {
		return display(data);
	}

	if (message) {
		return message;
	}

	// Fallback: JSON
	return JSON.stringify(data, null, 2);
}

function isResultWithData(result: unknown): result is { data: unknown } {
	return typeof result === "object" && result !== null && "data" in result;
}

function isResultWithMessage(result: unknown): result is { message: string } {
	return (
		typeof result === "object" &&
		result !== null &&
		"message" in result &&
		typeof (result as any).message === "string"
	);
}

function extractIds(data: unknown): string {
	if (Array.isArray(data)) {
		return data
			.map((item) => {
				if (typeof item === "string") return item;
				if (typeof item === "object" && item !== null && "id" in item)
					return String(item.id);
				return JSON.stringify(item);
			})
			.join("\n");
	}

	if (typeof data === "object" && data !== null && "id" in data) {
		return String((data as any).id);
	}

	return JSON.stringify(data);
}

const URL_CELL = /^https?:\/\/\S+$/;

const supportsHyperlinks = () =>
	process.stdout.isTTY === true && process.env.TERM !== "dumb";

/**
 * OSC 8 hyperlink. Terminals detect links from the text they can see, so a
 * truncated URL becomes a truncated link — this carries the whole target
 * while the cell stays narrow.
 */
function hyperlink(url: string, label: string): string {
	if (!supportsHyperlinks()) return label;
	return `\x1b]8;;${url}\x07${label}\x1b]8;;\x07`;
}

interface Cell {
	/** What the reader sees, and what the column is measured against. */
	text: string;
	/** Full target when `text` is a possibly-truncated URL. */
	link?: string;
}

// Table utility — commands can use this in their display function
export function table(
	data: Record<string, unknown>[],
	columns: string[],
	headers?: string[],
	maxColWidth: number | (number | undefined)[] = 60,
): string {
	if (data.length === 0) return "No results.";

	const caps = columns.map((_, i) =>
		Array.isArray(maxColWidth) ? (maxColWidth[i] ?? 60) : maxColWidth,
	);
	const hdrs = headers ?? columns.map((c) => c.toUpperCase());
	const rows = data.map((row) =>
		columns.map((col, i): Cell => {
			const val = getNestedValue(row, col);
			const str = val === null || val === undefined ? "—" : String(val);
			const cap = caps[i]!;
			const text = str.length > cap ? `${str.slice(0, cap - 1)}…` : str;
			return URL_CELL.test(str) ? { text, link: str } : { text };
		}),
	);

	// Calculate column widths (capped by terminal width heuristic)
	const widths = hdrs.map((h, i) =>
		Math.min(
			caps[i]!,
			Math.max(h.length, ...rows.map((r) => r[i]?.text.length ?? 0)),
		),
	);

	// Render. Padding sits outside the escape sequence so the clickable region
	// stops at the URL rather than running to the column edge.
	const headerLine = hdrs.map((h, i) => h.padEnd(widths[i]!)).join("  ");
	const bodyLines = rows.map((r) =>
		r
			.map((cell, i) => {
				const padding = " ".repeat(Math.max(0, widths[i]! - cell.text.length));
				const body = cell.link ? hyperlink(cell.link, cell.text) : cell.text;
				return body + padding;
			})
			.join("  "),
	);

	return [headerLine, ...bodyLines].join("\n");
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	return path.split(".").reduce<unknown>((acc, key) => {
		if (typeof acc === "object" && acc !== null && key in acc) {
			return (acc as Record<string, unknown>)[key];
		}
		return undefined;
	}, obj);
}
