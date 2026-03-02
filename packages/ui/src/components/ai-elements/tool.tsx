"use client";

import {
	CheckCircleIcon,
	CheckIcon,
	ChevronDownIcon,
	CircleIcon,
	ClockIcon,
	WrenchIcon,
	XCircleIcon,
	XIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { cn } from "../../lib/utils";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../ui/collapsible";
import { CodeBlock } from "./code-block";

/** TanStack AI native states + derived output states. */
export type ToolDisplayState =
	| "awaiting-input"
	| "input-streaming"
	| "input-complete"
	| "input-available"
	| "approval-requested"
	| "approval-responded"
	| "output-available"
	| "output-error"
	| "output-denied";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
	<Collapsible
		className={cn(
			"not-prose mb-4 w-full overflow-hidden rounded-lg border border-border bg-muted/30",
			className,
		)}
		{...props}
	/>
);

export type ToolHeaderProps = {
	title?: string;
	type?: string;
	state: ToolDisplayState;
	className?: string;
};

function getToolDisplayName(title?: string, type?: string): string {
	if (title) return title;
	if (type) return type.split("-").slice(1).join("-");
	return "tool";
}

const getStatusIcon = (status: ToolDisplayState) => {
	const icons: Record<ToolDisplayState, ReactNode> = {
		"awaiting-input": <CircleIcon className="size-3" />,
		"input-streaming": <CircleIcon className="size-3" />,
		"input-complete": <ClockIcon className="size-3 animate-pulse" />,
		"input-available": <ClockIcon className="size-3 animate-pulse" />,
		"approval-requested": <ClockIcon className="size-3 text-yellow-600" />,
		"approval-responded": <CheckCircleIcon className="size-3 text-blue-600" />,
		"output-available": <CheckIcon className="size-3 text-green-600" />,
		"output-error": <XIcon className="size-3 text-red-600" />,
		"output-denied": <XCircleIcon className="size-3 text-orange-600" />,
	};

	return icons[status];
};

export const ToolHeader = ({
	className,
	title,
	type,
	state,
	...props
}: ToolHeaderProps) => (
	<CollapsibleTrigger
		className={cn(
			"group flex h-7 w-full items-center justify-between gap-3 px-2.5 transition-colors hover:bg-muted/50",
			className,
		)}
		{...props}
	>
		<div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
			<WrenchIcon className="h-3 w-3 shrink-0" />
			<span className="truncate font-medium text-foreground">
				{getToolDisplayName(title, type)}
			</span>
		</div>
		<div className="ml-2 flex shrink-0 items-center gap-1.5 text-muted-foreground">
			{getStatusIcon(state)}
			<ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
		</div>
	</CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
	<CollapsibleContent
		className={cn(
			"border-t border-border data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
			className,
		)}
		{...props}
	/>
);

export type ToolInputProps = ComponentProps<"div"> & {
	input: unknown;
};

function formatJson(input: unknown): string {
	if (typeof input === "string") {
		try {
			return JSON.stringify(JSON.parse(input), null, 2);
		} catch {
			return input;
		}
	}
	return JSON.stringify(input, null, 2);
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
	const displayCode = formatJson(input);

	return (
		<div className={cn("space-y-2 overflow-hidden p-4", className)} {...props}>
			<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				Parameters
			</h4>
			<div className="rounded-md bg-muted/50">
				<CodeBlock code={displayCode} language="json" />
			</div>
		</div>
	);
};

export type ToolOutputProps = ComponentProps<"div"> & {
	output?: unknown;
	errorText?: string;
};

export const ToolOutput = ({
	className,
	output,
	errorText,
	...props
}: ToolOutputProps) => {
	if (!(output || errorText)) {
		return null;
	}

	let Output = <div>{output as ReactNode}</div>;

	if (typeof output === "object" && !isValidElement(output)) {
		Output = (
			<CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
		);
	} else if (typeof output === "string") {
		Output = <CodeBlock code={output} language="json" />;
	}

	return (
		<div className={cn("space-y-2 p-4", className)} {...props}>
			<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{errorText ? "Error" : "Result"}
			</h4>
			<div
				className={cn(
					"overflow-x-auto rounded-md text-xs [&_table]:w-full",
					errorText
						? "bg-destructive/10 text-destructive"
						: "bg-muted/50 text-foreground",
				)}
			>
				{errorText && <div>{errorText}</div>}
				{Output}
			</div>
		</div>
	);
};
