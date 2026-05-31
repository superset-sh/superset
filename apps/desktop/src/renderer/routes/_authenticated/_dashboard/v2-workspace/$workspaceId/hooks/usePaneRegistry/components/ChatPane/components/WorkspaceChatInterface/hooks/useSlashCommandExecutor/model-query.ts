import { tokenizeSlashCommandArguments } from "@superset/chat/shared";

export { findModelByQuery } from "renderer/components/Chat/ChatInterface/utils/modelOptions";

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
