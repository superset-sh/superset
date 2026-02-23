import type { ChatMcpStatus } from "@superset/chat/client";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorTrigger,
} from "@superset/ui/ai-elements/model-selector";
import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";

interface ParsedMcpIssue {
	id: string;
	serverName: string | null;
	summary: string;
	detail: string | null;
}

function parseMcpIssue(error: string, index: number): ParsedMcpIssue {
	const skipMatch = error.match(
		/^Skipping MCP server "([^"]+)" from (.+?): (.+)$/,
	);
	if (skipMatch?.[1] && skipMatch[2] && skipMatch[3]) {
		return {
			id: `skip-${index}`,
			serverName: skipMatch[1],
			summary: skipMatch[3],
			detail: skipMatch[2],
		};
	}

	const connectMatch = error.match(
		/^Failed to connect MCP server "([^"]+)": (.+)$/,
	);
	if (connectMatch?.[1] && connectMatch[2]) {
		return {
			id: `connect-${index}`,
			serverName: connectMatch[1],
			summary: connectMatch[2],
			detail: null,
		};
	}

	return {
		id: `other-${index}`,
		serverName: null,
		summary: error,
		detail: null,
	};
}

export function McpStatusPicker({
	mcp,
	open,
	onOpenChange,
}: {
	mcp: ChatMcpStatus | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const loadedCount = mcp?.serverNames.length ?? 0;
	const issueCount = mcp?.errors.length ?? 0;
	const issues = (mcp?.errors ?? []).map((error, index) =>
		parseMcpIssue(error, index),
	);

	return (
		<ModelSelector open={open} onOpenChange={onOpenChange}>
			<ModelSelectorTrigger asChild>
				<PromptInputButton className="gap-1.5 text-xs">
					<span>MCP</span>
					{loadedCount > 0 && (
						<span className="text-muted-foreground">{loadedCount}</span>
					)}
					{issueCount > 0 && (
						<span className="text-destructive">{issueCount} issue(s)</span>
					)}
				</PromptInputButton>
			</ModelSelectorTrigger>
			<ModelSelectorContent title="MCP Servers">
				<ModelSelectorInput placeholder="Search MCP status..." />
				<ModelSelectorList>
					<ModelSelectorEmpty>
						No MCP data yet. Status appears after chat runtime starts.
					</ModelSelectorEmpty>
					{mcp && (
						<>
							{mcp.serverNames.length > 0 && (
								<ModelSelectorGroup heading="Loaded">
									{mcp.serverNames.map((serverName) => (
										<ModelSelectorItem
											key={`loaded-${serverName}`}
											value={`loaded ${serverName}`}
											disabled
										>
											<div className="flex flex-1 flex-col gap-0.5">
												<span className="text-sm">{serverName}</span>
												<span className="text-muted-foreground text-xs">
													Connected
												</span>
											</div>
										</ModelSelectorItem>
									))}
								</ModelSelectorGroup>
							)}
							{issues.length > 0 && (
								<ModelSelectorGroup heading="Issues">
									{issues.map((issue) => (
										<ModelSelectorItem
											key={issue.id}
											value={`issue ${issue.serverName ?? ""} ${issue.summary} ${issue.detail ?? ""}`}
											disabled
										>
											<div className="flex flex-1 flex-col gap-0.5">
												<span className="text-sm">
													{issue.serverName ? issue.serverName : "MCP"}
												</span>
												<span className="text-muted-foreground text-xs">
													{issue.summary}
												</span>
												{issue.detail && (
													<span className="text-muted-foreground/80 text-xs">
														{issue.detail}
													</span>
												)}
											</div>
										</ModelSelectorItem>
									))}
								</ModelSelectorGroup>
							)}
							{mcp.sources.length > 0 && (
								<ModelSelectorGroup heading="Sources">
									{mcp.sources.map((source) => (
										<ModelSelectorItem
											key={source}
											value={`source ${source}`}
											disabled
										>
											<div className="flex flex-1 flex-col gap-0.5">
												<span className="truncate text-xs">{source}</span>
											</div>
										</ModelSelectorItem>
									))}
								</ModelSelectorGroup>
							)}
							{mcp.updatedAt && (
								<ModelSelectorGroup heading="Updated">
									<ModelSelectorItem
										value={`updated ${mcp.updatedAt}`}
										disabled
									>
										<span className="text-xs">
											{new Date(mcp.updatedAt).toLocaleString()}
										</span>
									</ModelSelectorItem>
								</ModelSelectorGroup>
							)}
						</>
					)}
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
