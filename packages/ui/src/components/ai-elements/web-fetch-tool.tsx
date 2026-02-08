"use client";

import {
	CheckCircleIcon,
	ChevronDownIcon,
	GlobeIcon,
	XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Loader } from "./loader";
import { Shimmer } from "./shimmer";

type WebFetchToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

type WebFetchToolProps = {
	url?: string;
	content?: string;
	bytes?: number;
	statusCode?: number;
	state: WebFetchToolState;
	className?: string;
};

function extractHostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const StatusIcon = ({ state }: { state: WebFetchToolState }) => {
	if (state === "input-streaming" || state === "input-available") {
		return <Loader className="text-muted-foreground" size={14} />;
	}
	if (state === "output-error") {
		return <XCircleIcon className="size-3.5 text-red-500" />;
	}
	return <CheckCircleIcon className="size-3.5 text-green-500" />;
};

export const WebFetchTool = ({
	url,
	content,
	bytes,
	statusCode,
	state,
	className,
}: WebFetchToolProps) => {
	const [expanded, setExpanded] = useState(false);
	const isPending = state === "input-streaming" || state === "input-available";
	const hasContent = Boolean(content);
	const hostname = url ? extractHostname(url) : undefined;

	return (
		<div
			className={cn(
				"not-prose mb-4 w-full overflow-hidden rounded-md border",
				className,
			)}
		>
			{/* Header */}
			<button
				className="flex w-full items-center gap-2 px-3 py-2"
				disabled={!hasContent}
				onClick={() => setExpanded((prev) => !prev)}
				type="button"
			>
				<GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
				<StatusIcon state={state} />
				{isPending ? (
					<Shimmer as="span" className="text-xs">
						{hostname ? `Fetching ${hostname}...` : "Fetching..."}
					</Shimmer>
				) : (
					<span className="min-w-0 truncate text-muted-foreground text-xs">
						{state === "output-error" ? "Fetch failed" : "Fetched"}{" "}
						{hostname && <span className="text-foreground">{hostname}</span>}
					</span>
				)}
				{bytes !== undefined && (
					<span className="shrink-0 text-muted-foreground/70 text-xs">
						{formatBytes(bytes)}
					</span>
				)}
				{statusCode !== undefined && statusCode >= 400 && (
					<span className="shrink-0 text-red-500 text-xs">{statusCode}</span>
				)}
				{hasContent && (
					<ChevronDownIcon
						className={cn(
							"ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
							expanded && "rotate-180",
						)}
					/>
				)}
			</button>

			{/* Expandable content */}
			{expanded && content && (
				<div className="max-h-[300px] overflow-y-auto border-t bg-muted/30">
					<pre className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs text-muted-foreground">
						{content}
					</pre>
				</div>
			)}
		</div>
	);
};
