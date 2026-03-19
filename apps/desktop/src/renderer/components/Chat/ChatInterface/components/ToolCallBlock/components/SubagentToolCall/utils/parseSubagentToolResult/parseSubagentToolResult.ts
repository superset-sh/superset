interface SubagentToolExecution {
	name: string;
	isError: boolean;
}

export interface SubagentToolResultSummary {
	text: string;
	modelId?: string;
	durationMs?: number;
	tools: SubagentToolExecution[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function firstString(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed.length > 0) return trimmed;
	}
	return null;
}

function parseTools(value: string | undefined): SubagentToolExecution[] {
	if (!value) return [];
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map((entry) => {
			const [namePart, statusPart] = entry.split(":");
			const name = namePart?.trim() || "tool";
			const status = statusPart?.trim().toLowerCase() || "ok";
			return {
				name,
				isError: status === "error" || status === "failed",
			};
		});
}

export function parseSubagentToolResult(
	value: unknown,
): SubagentToolResultSummary {
	const record = asRecord(value);
	const textContent =
		firstString(record?.content, record?.result, record?.text) ?? "";
	const metaTagRegex = /<subagent-meta\s+([^>]+?)\s*\/>/i;
	const match = textContent.match(metaTagRegex);
	if (!match) {
		return {
			text: textContent,
			tools: [],
		};
	}

	const attrsText = match[1] ?? "";
	const attrs = new Map<string, string>();
	for (const attr of attrsText.matchAll(/([a-zA-Z0-9_]+)="([^"]*)"/g)) {
		attrs.set(attr[1], attr[2]);
	}

	const durationRaw = attrs.get("durationMs");
	const durationMs = durationRaw ? Number(durationRaw) : Number.NaN;
	return {
		text: textContent.replace(metaTagRegex, "").trim(),
		modelId: attrs.get("modelId"),
		durationMs:
			Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : undefined,
		tools: parseTools(attrs.get("tools")),
	};
}
