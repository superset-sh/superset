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

// Table utility — commands can use this in their display function
export function table(
	data: Record<string, unknown>[],
	columns: string[],
	headers?: string[],
	maxColWidth = 60,
): string {
	if (data.length === 0) return "No results.";

	const hdrs = headers ?? columns.map((c) => c.toUpperCase());
	const rows = data.map((row) =>
		columns.map((col) => {
			const val = getNestedValue(row, col);
			const str = val === null || val === undefined ? "—" : String(val);
			return str.length > maxColWidth
				? `${str.slice(0, maxColWidth - 1)}…`
				: str;
		}),
	);

	// Calculate column widths (capped by terminal width heuristic)
	const widths = hdrs.map((h, i) =>
		Math.min(
			maxColWidth,
			Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)),
		),
	);

	// Render
	const headerLine = hdrs.map((h, i) => h.padEnd(widths[i]!)).join("  ");
	const bodyLines = rows.map((r) =>
		r.map((cell, i) => cell.padEnd(widths[i]!)).join("  "),
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
