export type OutputFlags = {
	json: boolean;
	quiet: boolean;
};

/** Pagination metadata describing a single page of a larger result set. */
export type Pagination = {
	/** Number of items in this response. */
	returned: number;
	/** Max items the caller asked for, or `null` if no cap was applied (e.g. `--all`). */
	limit: number | null;
	/** Items skipped before this page. */
	offset: number;
	/** Whether more items exist beyond this page. */
	hasMore: boolean;
};

/** A page of list results paired with pagination metadata. */
export type PaginatedResult<T> = {
	data: T[];
	pagination: Pagination;
};

/**
 * Wrap a page of results with pagination metadata. Commands that return this
 * get a "more results available" footer in human output and a structured
 * `{ data, pagination }` object under `--json`, so both people and agents can
 * tell when results were capped by `--limit`.
 */
export function paginated<T>(
	data: T[],
	pagination: Pagination,
): PaginatedResult<T> {
	return { data, pagination };
}

export function formatOutput(
	result: unknown,
	display: ((data: unknown) => string) | undefined,
	flags: OutputFlags,
): string {
	if (isPaginatedResult(result)) {
		return formatPaginated(result, display, flags);
	}

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

function formatPaginated(
	result: PaginatedResult<unknown>,
	display: ((data: unknown) => string) | undefined,
	flags: OutputFlags,
): string {
	const { data, pagination } = result;

	// JSON keeps the metadata so agents can read `hasMore` programmatically.
	if (flags.json) {
		return JSON.stringify({ data, pagination }, null, 2);
	}

	if (flags.quiet) {
		return extractIds(data);
	}

	const body = display ? display(data) : JSON.stringify(data, null, 2);
	const footer = paginationFooter(pagination);
	return footer ? `${body}\n\n${footer}` : body;
}

function paginationFooter(pagination: Pagination): string {
	if (!pagination.hasMore) return "";
	const next = pagination.offset + pagination.returned;
	return `Showing ${pagination.returned} result(s); more available — pass --offset ${next} or a higher --limit for the rest.`;
}

function isPaginatedResult(
	result: unknown,
): result is PaginatedResult<unknown> {
	if (typeof result !== "object" || result === null) return false;
	if (!("data" in result) || !("pagination" in result)) return false;
	const data = (result as { data: unknown }).data;
	const pagination = (result as { pagination: unknown }).pagination;
	if (!Array.isArray(data)) return false;
	if (typeof pagination !== "object" || pagination === null) return false;
	const p = pagination as Record<string, unknown>;
	return (
		typeof p.returned === "number" &&
		(typeof p.limit === "number" || p.limit === null) &&
		typeof p.offset === "number" &&
		typeof p.hasMore === "boolean"
	);
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
