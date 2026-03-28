import { getResult, type ToolPart } from "../../../../utils/tool-helpers";

export function getToolResultData(part: ToolPart): Record<string, unknown> {
	const result = getResult(part);
	if (typeof result.result === "object" && result.result !== null) {
		return result.result as Record<string, unknown>;
	}
	return result;
}

export function getToolResultObjectArray(
	resultData: Record<string, unknown>,
	key: string,
): Record<string, unknown>[] {
	const value = resultData[key];
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(
		(item): item is Record<string, unknown> =>
			typeof item === "object" && item !== null,
	);
}
