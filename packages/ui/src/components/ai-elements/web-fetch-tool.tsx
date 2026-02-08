"use client";

import { GlobeIcon } from "lucide-react";
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
		return new URL(url).hostname.replace("www.", "");
	} catch {
		return url.slice(0, 30);
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const WebFetchTool = ({
	url,
	content,
	bytes,
	statusCode,
	state,
	className,
}: WebFetchToolProps) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const isPending = state === "input-streaming" || state === "input-available";
	const isError = state === "output-error";
	const isSuccess = statusCode === 200;
	const hasContent = Boolean(content);
	const hostname = url ? extractHostname(url) : "";

	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border border-border bg-muted/30",
				className,
			)}
		>
			{/* Header */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: interactive tool header */}
			<div
				className={cn(
					"flex h-7 items-center justify-between px-2.5",
					hasContent &&
						!isPending &&
						"cursor-pointer transition-colors duration-150 hover:bg-muted/50",
				)}
				onClick={() => hasContent && !isPending && setIsExpanded(!isExpanded)}
			>
				<div className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs">
					<GlobeIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
					{isPending ? (
						<Shimmer
							as="span"
							duration={1.2}
							className="text-xs text-muted-foreground"
						>
							Fetching
						</Shimmer>
					) : (
						<span className="text-xs text-muted-foreground">Fetched</span>
					)}
					{hostname && (
						<span className="truncate text-foreground">{hostname}</span>
					)}
				</div>

				{/* Status */}
				<div className="ml-2 flex shrink-0 items-center gap-2">
					<div className="flex items-center gap-1.5 text-xs">
						{isPending ? (
							<Loader size={12} />
						) : isError || !isSuccess ? (
							<span className="text-destructive">
								{statusCode ? `Error ${statusCode}` : "Failed"}
							</span>
						) : bytes !== undefined ? (
							<span className="text-muted-foreground">
								{formatBytes(bytes)}
							</span>
						) : null}
					</div>
				</div>
			</div>

			{/* Content */}
			{hasContent && isExpanded && (
				<div className="max-h-[300px] overflow-y-auto border-t border-border">
					<pre className="whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-xs text-foreground">
						{content}
					</pre>
				</div>
			)}
		</div>
	);
};
