import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { WrenchIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useMemo } from "react";
import type { ToolPart } from "../../../../utils/tool-helpers";

type SupersetToolCallProps = {
	part: ToolPart;
	toolName: string;
	icon?: ComponentType<{ className?: string }>;
	details?: ReactNode;
};

function stringifyValue(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function SupersetToolCall({
	part,
	toolName,
	icon: Icon = WrenchIcon,
	details,
}: SupersetToolCallProps) {
	const output =
		"output" in part ? (part as { output?: unknown }).output : undefined;
	const outputObject =
		output != null && typeof output === "object"
			? (output as Record<string, unknown>)
			: undefined;
	const outputError = outputObject?.error;
	const isError = part.state === "output-error" || Boolean(outputError);
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";

	const errorText = useMemo(() => {
		if (!isError) return null;
		if (typeof outputError === "string") return outputError;
		if (typeof outputObject?.message === "string") return outputObject.message;
		if (outputError !== undefined) return stringifyValue(outputError);
		if (output !== undefined) return stringifyValue(output);
		return "Tool failed";
	}, [isError, output, outputError, outputObject?.message]);

	const hasDetails = Boolean(details) || isError;

	return (
		<ToolCallRow
			icon={Icon}
			isError={isError}
			isPending={isPending}
			title={toolName}
		>
			{hasDetails ? (
				<div className="space-y-1 pl-2">
					{details ? (
						<div className="rounded border bg-muted/20 ps-2 text-xs">
							{details}
						</div>
					) : null}
					{isError && errorText ? (
						<div className="rounded border border-destructive/40 bg-destructive/10 ps-2 text-xs text-destructive">
							{errorText}
						</div>
					) : null}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
