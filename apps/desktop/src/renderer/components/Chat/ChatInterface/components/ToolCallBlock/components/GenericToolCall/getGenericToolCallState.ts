import type { ToolDisplayState } from "@superset/ui/ai-elements/tool";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { toToolDisplayState } from "../../../../utils/tool-helpers";

export type GenericToolCallState = {
	output: unknown;
	isError: boolean;
	displayState: ToolDisplayState;
	errorText?: string;
};

function stringifyValue(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function getGenericToolCallState(part: ToolPart): GenericToolCallState {
	const output =
		"output" in part ? (part as { output: unknown }).output : undefined;
	const outputObject =
		output != null && typeof output === "object"
			? (output as Record<string, unknown>)
			: undefined;
	const outputError = outputObject?.error;
	const isOutputError =
		outputObject != null && "error" in outputObject && Boolean(outputError);
	const isError = part.state === "output-error" || isOutputError;

	const baseDisplayState = toToolDisplayState(part);
	const displayState =
		isOutputError && baseDisplayState === "output-available"
			? "output-error"
			: baseDisplayState;

	let errorText: string | undefined;
	if (isError) {
		if (typeof output === "string") {
			errorText = output;
		} else if (typeof outputError === "string") {
			errorText = outputError;
		} else if (typeof outputObject?.message === "string") {
			errorText = outputObject.message;
		} else if (outputError !== undefined) {
			errorText = stringifyValue(outputError);
		}
	}

	return {
		output,
		isError,
		displayState,
		errorText,
	};
}
