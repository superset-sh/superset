import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { CheckIcon, Loader2Icon, WrenchIcon, XIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
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
	const [isOpen, setIsOpen] = useState(false);
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
		<Collapsible
			className="overflow-hidden rounded-md"
			onOpenChange={(open) => hasDetails && setIsOpen(open)}
			open={hasDetails ? isOpen : false}
		>
			<CollapsibleTrigger asChild>
				<button
					className={
						hasDetails
							? "flex h-7 w-full items-center justify-between px-2.5 text-left transition-colors duration-150 hover:bg-muted/30"
							: "flex h-7 w-full items-center justify-between px-2.5 text-left"
					}
					disabled={!hasDetails}
					type="button"
				>
					<div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
						<Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
						<ShimmerLabel
							className="truncate text-xs text-muted-foreground"
							isShimmering={isPending}
						>
							{toolName}
						</ShimmerLabel>
					</div>
					<div className="ml-2 flex h-6 w-6 items-center justify-center text-muted-foreground">
						{isPending ? (
							<Loader2Icon className="h-3 w-3 animate-spin" />
						) : isError ? (
							<XIcon className="h-3 w-3" />
						) : (
							<CheckIcon className="h-3 w-3" />
						)}
					</div>
				</button>
			</CollapsibleTrigger>
			{hasDetails ? (
				<CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
					<div className="mt-0.5 space-y-1">
						{details ? (
							<div className="rounded border bg-muted/20 p-2.5 text-xs">
								{details}
							</div>
						) : null}
						{isError && errorText ? (
							<div className="rounded border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
								{errorText}
							</div>
						) : null}
					</div>
				</CollapsibleContent>
			) : null}
		</Collapsible>
	);
}
