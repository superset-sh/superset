"use client";

import { ExternalLinkIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Loader } from "./loader";
import { ShimmerLabel } from "./shimmer-label";

type WebSearchToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

type SearchResult = { title: string; url: string };

type WebSearchToolProps = {
	query?: string;
	results: SearchResult[];
	state: WebSearchToolState;
	className?: string;
};

export const WebSearchTool = ({
	query,
	results,
	state,
	className,
}: WebSearchToolProps) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const isPending = state === "input-streaming" || state === "input-available";
	const isError = state === "output-error";
	const hasResults = results.length > 0;
	const truncatedQuery =
		query && query.length > 40 ? `${query.slice(0, 37)}...` : query;

	return (
		<div className={cn("overflow-hidden rounded-md", className)}>
			{/* Header */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: interactive tool header */}
			<div
				className={cn(
					"flex h-7 items-center justify-between px-2.5",
					hasResults &&
						!isPending &&
						"cursor-pointer transition-colors duration-150 hover:bg-muted/30",
				)}
				onClick={() => hasResults && !isPending && setIsExpanded(!isExpanded)}
			>
				<div className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs">
					<SearchIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
					{isPending ? (
						<ShimmerLabel className="text-xs text-muted-foreground">
							Searching
						</ShimmerLabel>
					) : (
						<span className="text-xs text-muted-foreground">Searched</span>
					)}
					{truncatedQuery && (
						<span className="truncate text-foreground">{truncatedQuery}</span>
					)}
				</div>

				{/* Status */}
				<div className="ml-2 flex shrink-0 items-center gap-2">
					<div className="flex items-center gap-1.5 text-xs">
						{isPending ? (
							<Loader size={12} />
						) : isError ? (
							<span className="text-destructive">Failed</span>
						) : (
							<span className="text-muted-foreground">
								{results.length} {results.length === 1 ? "result" : "results"}
							</span>
						)}
					</div>
				</div>
			</div>

			{/* Results list */}
			{hasResults && isExpanded && (
				<div className="mt-0.5 max-h-[200px] overflow-y-auto">
					{results.map((result, idx) => (
						<a
							className="group flex items-start gap-2 px-2.5 py-1.5 transition-colors hover:bg-muted/30"
							href={result.url}
							key={`${result.url}-${idx}`}
							rel="noopener noreferrer"
							target="_blank"
						>
							<ExternalLinkIcon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
							<div className="min-w-0 flex-1">
								<div className="truncate text-xs text-foreground">
									{result.title}
								</div>
								<div className="truncate text-[10px] text-muted-foreground">
									{result.url}
								</div>
							</div>
						</a>
					))}
				</div>
			)}
		</div>
	);
};
