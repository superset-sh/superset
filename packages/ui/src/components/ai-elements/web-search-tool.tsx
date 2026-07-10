"use client";

import { ExternalLinkIcon, GlobeIcon } from "lucide-react";
import { Loader } from "./loader";
import { ToolCallRow } from "./tool-call-row";

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
	const isPending = state === "input-streaming" || state === "input-available";
	const isError = state === "output-error";
	const hasResults = results.length > 0;

	const statusNode = isPending ? (
		<div className="flex h-6 w-6 items-center justify-center">
			<Loader size={12} />
		</div>
	) : isError ? (
		<span className="text-xs text-destructive">Failed</span>
	) : null;

	return (
		<ToolCallRow
			className={className}
			description={query}
			icon={GlobeIcon}
			isError={isError}
			isPending={isPending}
			statusNode={statusNode}
			title="Web Search"
		>
			{hasResults ? (
				<div className="max-h-[200px] overflow-y-auto">
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
			) : undefined}
		</ToolCallRow>
	);
};
