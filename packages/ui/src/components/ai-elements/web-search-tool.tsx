"use client";

import {
	CheckCircleIcon,
	ChevronDownIcon,
	ExternalLinkIcon,
	SearchIcon,
	XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Loader } from "./loader";
import { Shimmer } from "./shimmer";

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

const StatusIcon = ({ state }: { state: WebSearchToolState }) => {
	if (state === "input-streaming" || state === "input-available") {
		return <Loader className="text-muted-foreground" size={14} />;
	}
	if (state === "output-error") {
		return <XCircleIcon className="size-3.5 text-red-500" />;
	}
	return <CheckCircleIcon className="size-3.5 text-green-500" />;
};

export const WebSearchTool = ({
	query,
	results,
	state,
	className,
}: WebSearchToolProps) => {
	const [expanded, setExpanded] = useState(false);
	const isPending = state === "input-streaming" || state === "input-available";
	const hasResults = results.length > 0;

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
				disabled={!hasResults}
				onClick={() => setExpanded((prev) => !prev)}
				type="button"
			>
				<SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
				<StatusIcon state={state} />
				{isPending ? (
					<Shimmer as="span" className="text-xs">
						{query ? `Searching "${query}"` : "Searching web..."}
					</Shimmer>
				) : (
					<span className="min-w-0 truncate text-muted-foreground text-xs">
						{state === "output-error" ? "Search failed" : "Searched"}{" "}
						{query && (
							<>
								&ldquo;<span className="text-foreground">{query}</span>&rdquo;
							</>
						)}
					</span>
				)}
				{hasResults && (
					<span className="shrink-0 text-muted-foreground/70 text-xs">
						{results.length} result{results.length !== 1 ? "s" : ""}
					</span>
				)}
				{hasResults && (
					<ChevronDownIcon
						className={cn(
							"ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
							expanded && "rotate-180",
						)}
					/>
				)}
			</button>

			{/* Expandable results */}
			{expanded && hasResults && (
				<div className="max-h-[200px] overflow-y-auto border-t">
					{results.map((result) => (
						<a
							className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50"
							href={result.url}
							key={result.url}
							rel="noopener noreferrer"
							target="_blank"
						>
							<ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />
							<span className="min-w-0 truncate text-foreground">
								{result.title}
							</span>
							<span className="ml-auto shrink-0 truncate text-muted-foreground/70 text-xs">
								{extractHostname(result.url)}
							</span>
						</a>
					))}
				</div>
			)}
		</div>
	);
};

function extractHostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}
