type UnknownRecord = Record<string, unknown>;

export interface WebSearchResultItem {
	title: string;
	url: string;
}

export interface WebSearchViewModel {
	query: string;
	results: WebSearchResultItem[];
}

function toRecord(value: unknown): UnknownRecord | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as UnknownRecord;
	}
	return undefined;
}

function isValidHttpUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function normalizeUrl(raw: string): string | undefined {
	const cleaned = raw.replace(/[),.;]+$/, "").trim();
	if (!isValidHttpUrl(cleaned)) return undefined;
	return cleaned;
}

function titleFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function dedupeResults(results: WebSearchResultItem[]): WebSearchResultItem[] {
	const seen = new Set<string>();
	const deduped: WebSearchResultItem[] = [];
	for (const result of results) {
		const key = result.url.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(result);
	}
	return deduped;
}

function parseResultsArray(value: unknown): WebSearchResultItem[] {
	if (!Array.isArray(value)) return [];
	const parsed: WebSearchResultItem[] = [];
	for (const item of value) {
		const record = toRecord(item);
		if (!record) continue;
		const rawUrl =
			typeof record.url === "string"
				? record.url
				: typeof record.link === "string"
					? record.link
					: typeof record.href === "string"
						? record.href
						: undefined;
		if (!rawUrl) continue;
		const url = normalizeUrl(rawUrl);
		if (!url) continue;
		const title =
			typeof record.title === "string"
				? record.title.trim()
				: typeof record.name === "string"
					? record.name.trim()
					: titleFromUrl(url);
		parsed.push({ title: title.length > 0 ? title : titleFromUrl(url), url });
	}
	return dedupeResults(parsed);
}

function parseResultsFromTranscript(text: string): WebSearchResultItem[] {
	const lines = text.split(/\r?\n/);
	const parsed: WebSearchResultItem[] = [];
	let currentHeading: string | undefined;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]?.trim() ?? "";
		if (line.length === 0) continue;

		if (line.startsWith("## ")) {
			const heading = line.slice(3).trim();
			currentHeading = heading.length > 0 ? heading : undefined;
			continue;
		}

		const urlCandidate = normalizeUrl(line);
		if (!urlCandidate) continue;

		const fallbackPrevLine = (() => {
			const prev = lines[index - 1]?.trim();
			if (!prev || prev.startsWith("http")) return undefined;
			return prev.replace(/^#+\s*/, "").trim();
		})();

		const title =
			currentHeading && currentHeading.length > 0
				? currentHeading
				: fallbackPrevLine && fallbackPrevLine.length > 0
					? fallbackPrevLine
					: titleFromUrl(urlCandidate);
		parsed.push({ title, url: urlCandidate });
	}

	return dedupeResults(parsed);
}

function extractResults(result: UnknownRecord): WebSearchResultItem[] {
	const graph: UnknownRecord[] = [];
	const queue: UnknownRecord[] = [result];
	const seen = new Set<UnknownRecord>();
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || seen.has(current)) continue;
		seen.add(current);
		graph.push(current);
		for (const key of ["output", "result"]) {
			const nested = toRecord(current[key]);
			if (nested && !seen.has(nested)) queue.push(nested);
		}
	}

	for (const node of graph) {
		for (const key of ["results", "items", "sources"]) {
			const parsed = parseResultsArray(node[key]);
			if (parsed.length > 0) return parsed;
		}
	}

	for (const node of graph) {
		for (const key of [
			"text",
			"content",
			"answer",
			"output_text",
			"outputText",
		]) {
			if (typeof node[key] !== "string") continue;
			const parsed = parseResultsFromTranscript(node[key] as string);
			if (parsed.length > 0) return parsed;
		}
	}

	return [];
}

function firstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
	}
	return undefined;
}

export function getWebSearchViewModel({
	args,
	result,
}: {
	args: UnknownRecord;
	result: UnknownRecord;
}): WebSearchViewModel {
	const query =
		firstString(
			args.query,
			args.search,
			args.q,
			result.query,
			result.search,
			result.q,
		) ?? "";

	return {
		query,
		results: extractResults(result),
	};
}
