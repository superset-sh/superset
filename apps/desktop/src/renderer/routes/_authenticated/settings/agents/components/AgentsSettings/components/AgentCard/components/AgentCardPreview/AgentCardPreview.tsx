import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";
import { Button } from "@superset/ui/button";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";

interface AgentCardPreviewProps {
	preset: ResolvedAgentConfig;
	showPreview: boolean;
	previewPrompt: string;
	previewNoPromptCommand: string;
	previewTaskCommand: string;
	onToggle: () => void;
}

export function AgentCardPreview({
	preset,
	showPreview,
	previewPrompt,
	previewNoPromptCommand,
	previewTaskCommand,
	onToggle,
}: AgentCardPreviewProps) {
	return (
		<>
			<div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
				<div>
					<p className="text-sm font-medium">Preview</p>
					<p className="text-xs text-muted-foreground">
						Check the rendered prompt and launch output before saving
					</p>
				</div>
				<Button type="button" variant="outline" size="sm" onClick={onToggle}>
					{showPreview ? "Hide Preview" : "Show Preview"}
				</Button>
			</div>

			{showPreview && (
				<div className="space-y-3 rounded-lg border bg-muted/30 p-4">
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							Rendered Task Prompt
						</p>
						<MarkdownRenderer
							content={previewPrompt}
							className="h-64 rounded-md border bg-background text-sm"
						/>
					</div>
					{preset.kind === "terminal" && (
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								No-Prompt Launch
							</p>
							<pre className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
								{previewNoPromptCommand}
							</pre>
						</div>
					)}
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground">
							{preset.kind === "terminal" ? "Task Launch" : "Chat Launch"}
						</p>
						<pre className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
							{previewTaskCommand}
						</pre>
					</div>
				</div>
			)}
		</>
	);
}
