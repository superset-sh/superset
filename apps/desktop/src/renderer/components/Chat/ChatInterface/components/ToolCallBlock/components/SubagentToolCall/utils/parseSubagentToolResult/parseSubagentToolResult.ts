export interface SubagentToolExecution {
	name: string;
	isError: boolean;
	args: Record<string, unknown> | null;
	result: string | null;
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

function parseDetailedToolCalls(
	content: string,
): { tools: SubagentToolExecution[]; stripped: string } | null {
	const match = content.match(
		/\n<subagent-tool-calls>([\s\S]*?)<\/subagent-tool-calls>/,
	);
	if (!match) return null;
	try {
		const parsed = JSON.parse(match[1]);
		if (!Array.isArray(parsed)) return null;
		const tools = parsed
			.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
			.map((item) => ({
				name: typeof item.name === "string" ? item.name : "tool",
				isError: item.isError === true,
				args:
					typeof item.args === "object" && item.args !== null
						? (item.args as Record<string, unknown>)
						: null,
				result:
					typeof item.result === "string"
						? item.result
						: item.result !== null && item.result !== undefined
							? String(item.result)
							: null,
			}));
		const stripped =
			content.slice(0, match.index) +
			content.slice((match.index ?? 0) + match[0].length);
		return { tools, stripped };
	} catch {
		return null;
	}
}

function parseLegacyTools(value: string | undefined): SubagentToolExecution[] {
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
				isError: status === "error" || status === "failed" || status === "err",
				args: null,
				result: null,
			};
		});
}

export function parseSubagentToolResult(
	value: unknown,
): SubagentToolResultSummary {
	const record = asRecord(value);
	const textContent =
		firstString(record?.content, record?.result, record?.text) ?? "";

	// Try to parse the detailed tool-calls block first
	const detailed = parseDetailedToolCalls(textContent);
	const workingContent = detailed ? detailed.stripped : textContent;

	const metaTagRegex = /\n?<subagent-meta\s+([^>]+?)\s*\/>/i;
	const match = workingContent.match(metaTagRegex);
	if (!match) {
		return {
			text: workingContent.trim(),
			tools: detailed?.tools ?? [],
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
		text: workingContent.replace(metaTagRegex, "").trim(),
		modelId: attrs.get("modelId"),
		durationMs:
			Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : undefined,
		tools: detailed?.tools ?? parseLegacyTools(attrs.get("tools")),
	};
}
