import type { ToolCallItem } from "@superset/session-protocol";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
	type ToolState,
} from "@/components/ai-elements/tool";

function toolState(item: ToolCallItem): ToolState {
	switch (item.status) {
		case "completed":
			return "output-available";
		case "error":
		case "denied":
			return "output-error";
		case "pending":
			return item.input === null ? "input-streaming" : "input-available";
	}
}

export function ToolCallItemView({ item }: { item: ToolCallItem }) {
	const state = toolState(item);
	return (
		<Tool className="mb-0 rounded-none border-0">
			<ToolHeader
				className="px-0.5 py-1"
				state={state}
				toolName={item.name}
				type="dynamic-tool"
			/>
			<ToolContent className="gap-3 px-0.5 py-2">
				{item.input === null ? null : <ToolInput input={item.input} />}
				<ToolOutput
					errorText={
						state === "output-error"
							? item.status === "denied"
								? "Permission denied"
								: stringifyResult(item.result) || "Tool failed"
							: undefined
					}
					output={state === "output-available" ? item.result : undefined}
				/>
			</ToolContent>
		</Tool>
	);
}

function stringifyResult(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) return "";
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}
