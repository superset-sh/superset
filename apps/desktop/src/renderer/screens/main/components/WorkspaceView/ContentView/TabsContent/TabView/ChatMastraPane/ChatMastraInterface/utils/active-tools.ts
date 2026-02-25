export type ActiveToolSnapshot = {
	name: string;
	args: unknown;
	status: "streaming_input" | "running" | "completed" | "error";
};

export interface ActiveToolEntry {
	id: string;
	tool: ActiveToolSnapshot;
}

export function stringifyCompact(value: unknown): string {
	try {
		if (typeof value === "string") return value;
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}...`;
}

export function toActiveToolEntries(value: unknown): ActiveToolEntry[] {
	if (value instanceof Map) {
		return [...value.entries()]
			.filter(
				(entry): entry is [string, ActiveToolSnapshot] =>
					typeof entry[0] === "string" &&
					Boolean(entry[1]) &&
					typeof entry[1] === "object" &&
					typeof entry[1].name === "string" &&
					typeof entry[1].status === "string",
			)
			.map(([id, tool]) => ({ id, tool }));
	}

	if (!value || typeof value !== "object" || Array.isArray(value)) return [];

	return Object.entries(value)
		.filter(
			(entry): entry is [string, ActiveToolSnapshot] =>
				typeof entry[0] === "string" &&
				Boolean(entry[1]) &&
				typeof entry[1] === "object" &&
				typeof (entry[1] as { name?: unknown }).name === "string" &&
				typeof (entry[1] as { status?: unknown }).status === "string",
		)
		.map(([id, tool]) => ({ id, tool }));
}
