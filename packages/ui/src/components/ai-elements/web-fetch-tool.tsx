"use client";

import { GlobeIcon } from "lucide-react";
import { Loader } from "./loader";
import { ToolCallRow } from "./tool-call-row";

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
	const isPending = state === "input-streaming" || state === "input-available";
	const isError = state === "output-error";
	const isSuccess = statusCode === 200;
	const hasContent = Boolean(content);
	const hostname = url ? extractHostname(url) : "";

	const statusNode = isPending ? (
		<div className="flex h-6 w-6 items-center justify-center">
			<Loader size={12} />
		</div>
	) : isError || !isSuccess ? (
		<span className="text-xs text-destructive">
			{statusCode ? `Error ${statusCode}` : "Failed"}
		</span>
	) : bytes !== undefined ? (
		<span className="text-xs text-muted-foreground">{formatBytes(bytes)}</span>
	) : null;

	return (
		<ToolCallRow
			className={className}
			description={hostname || undefined}
			icon={GlobeIcon}
			isError={isError}
			isPending={isPending}
			statusNode={statusNode}
			title="Web Fetch"
		>
			{hasContent ? (
				<div className="max-h-[300px] overflow-y-auto">
					<pre className="whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-xs text-foreground">
						{content}
					</pre>
				</div>
			) : undefined}
		</ToolCallRow>
	);
};
