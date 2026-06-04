import { tokenizeSlashCommandArguments } from "@superset/chat/shared";
import type { ModelOption } from "../../types";

export function normalizeModelQueryFromActionArgument(
	argumentRaw: string,
): string {
	const trimmed = argumentRaw.trim();
	if (!trimmed) return "";

	const tokens = tokenizeSlashCommandArguments(trimmed);
	if (tokens.length === 0) return "";
	if (tokens.length === 1) return tokens[0]?.trim() ?? "";

	return trimmed;
}

export function findModelByQuery(
	models: ModelOption[],
	query: string,
): ModelOption | null {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return null;

	const exactById = models.find(
		(model) => model.id.toLowerCase() === normalizedQuery,
	);
	if (exactById) return exactById;

	const exactByName = models.find(
		(model) => model.name.toLowerCase() === normalizedQuery,
	);
	if (exactByName) return exactByName;

	return (
		models.find(
			(model) =>
				model.id.toLowerCase().includes(normalizedQuery) ||
				model.name.toLowerCase().includes(normalizedQuery),
		) ?? null
	);
}
