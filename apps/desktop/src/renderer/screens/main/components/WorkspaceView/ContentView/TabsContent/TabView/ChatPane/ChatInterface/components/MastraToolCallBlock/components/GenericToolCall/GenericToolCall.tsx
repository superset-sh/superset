import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { ToolInput, ToolOutput } from "@superset/ui/ai-elements/tool";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { CheckIcon, Loader2Icon, WrenchIcon, XIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getGenericToolCallState } from "./getGenericToolCallState";

type GenericToolCallProps = {
	part: ToolPart;
	toolName: string;
	icon?: ComponentType<{ className?: string }>;
};

export function GenericToolCall({
	part,
	toolName,
	icon: Icon = WrenchIcon,
}: GenericToolCallProps) {
	const [isOpen, setIsOpen] = useState(false);
	const { output, isError, displayState, errorText } =
		getGenericToolCallState(part);
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";
	const hasDetails = part.input != null || output != null || isError;

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
						) : isError || displayState === "output-error" ? (
							<XIcon className="h-3 w-3" />
						) : (
							<CheckIcon className="h-3 w-3" />
						)}
					</div>
				</button>
			</CollapsibleTrigger>
			{hasDetails && (
				<CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
					<div className="mt-0.5">
						{part.input != null && <ToolInput input={part.input} />}
						{(output != null || isError) && (
							<ToolOutput
								output={!isError ? output : undefined}
								errorText={isError ? errorText : undefined}
							/>
						)}
					</div>
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
