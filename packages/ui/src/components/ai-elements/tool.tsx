"use client";

import {
	CheckCircleIcon,
	ChevronDownIcon,
	CircleIcon,
	ClockIcon,
	WrenchIcon,
	XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
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
		className={cn("not-prose mb-4 w-full rounded-md border", className)}
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

const getStatusBadge = (status: ToolDisplayState) => {
	const labels: Record<ToolDisplayState, string> = {
		"awaiting-input": "Pending",
		"input-streaming": "Pending",
		"input-complete": "Running",
		"input-available": "Running",
		"approval-requested": "Awaiting Approval",
		"approval-responded": "Responded",
		"output-available": "Completed",
		"output-error": "Error",
		"output-denied": "Denied",
	};

	const icons: Record<ToolDisplayState, ReactNode> = {
		"awaiting-input": <CircleIcon className="size-4" />,
		"input-streaming": <CircleIcon className="size-4" />,
		"input-complete": <ClockIcon className="size-4 animate-pulse" />,
		"input-available": <ClockIcon className="size-4 animate-pulse" />,
		"approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
		"approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
		"output-available": <CheckCircleIcon className="size-4 text-green-600" />,
		"output-error": <XCircleIcon className="size-4 text-red-600" />,
		"output-denied": <XCircleIcon className="size-4 text-orange-600" />,
	};

	return (
		<Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
			{icons[status]}
			{labels[status]}
		</Badge>
	);
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
			"flex w-full items-center justify-between gap-4 p-3",
			className,
		)}
		{...props}
	>
		<div className="flex items-center gap-2">
			<WrenchIcon className="size-4 text-muted-foreground" />
			<span className="font-medium text-sm">
				{getToolDisplayName(title, type)}
			</span>
			{getStatusBadge(state)}
		</div>
		<ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
	</CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
	<CollapsibleContent
		className={cn(
			"data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
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
