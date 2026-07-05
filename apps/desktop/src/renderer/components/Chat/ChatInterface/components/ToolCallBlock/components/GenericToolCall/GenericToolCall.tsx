import { ToolInput, ToolOutput } from "@superset/ui/ai-elements/tool";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { WrenchIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getGenericToolCallState } from "./getGenericToolCallState";

type GenericToolCallProps = {
	part: ToolPart;
	toolName: string;
	subtitle?: string;
	icon?: ComponentType<{ className?: string }>;
};

function getQueryFromInput(input: unknown): string | undefined {
	if (input != null && typeof input === "object" && !Array.isArray(input)) {
		const query = (input as Record<string, unknown>).query;
		if (typeof query === "string" && query.trim().length > 0) return query;
	}
	return undefined;
}

export function GenericToolCall({
	part,
	toolName,
	subtitle,
	icon: Icon = WrenchIcon,
}: GenericToolCallProps) {
	const { output, isError, isNotConfigured, displayState, errorText } =
		getGenericToolCallState(part);
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";
	const hasDetails = part.input != null || output != null || isError;
	const query = getQueryFromInput(part.input);

	return (
		<ToolCallRow
			description={subtitle}
			icon={Icon}
			isError={isError || displayState === "output-error"}
			isNotConfigured={isNotConfigured}
			isPending={isPending}
			title={toolName}
		>
			{hasDetails ? (
				<div className="space-y-3 py-1 pl-3">
					{query != null ? (
						<div className="space-y-1">
							<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Query
							</h4>
							<p className="text-xs text-foreground">{query}</p>
						</div>
					) : (
						part.input != null && <ToolInput input={part.input} />
					)}
					{(output != null || isError) && (
						<ToolOutput
							output={!isError ? output : undefined}
							errorText={isError ? errorText : undefined}
							label={query != null ? "Response" : undefined}
						/>
					)}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
