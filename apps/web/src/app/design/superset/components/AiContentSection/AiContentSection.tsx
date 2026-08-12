"use client";

import {
	Artifact,
	ArtifactActions,
	ArtifactClose,
	ArtifactDescription,
	ArtifactHeader,
	ArtifactTitle,
} from "@superset/ui/ai-elements/artifact";
import {
	Checkpoint,
	CheckpointIcon,
	CheckpointTrigger,
} from "@superset/ui/ai-elements/checkpoint";
import { CodeBlock } from "@superset/ui/ai-elements/code-block";
import {
	Context,
	ContextContent,
	ContextContentBody,
	ContextContentHeader,
	ContextTrigger,
} from "@superset/ui/ai-elements/context";
import {
	InlineCitation,
	InlineCitationCard,
	InlineCitationCardBody,
	InlineCitationCardTrigger,
	InlineCitationText,
} from "@superset/ui/ai-elements/inline-citation";
import {
	Source,
	Sources,
	SourcesContent,
	SourcesTrigger,
} from "@superset/ui/ai-elements/sources";
import { Button } from "@superset/ui/button";
import { DownloadIcon } from "lucide-react";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

const EXAMPLE_CODE = `export function Workspace({ branch }: WorkspaceProps) {
	const session = useAgentSession(branch);
	return <Terminal session={session} />;
}`;

const NOT_DEMOED = [
	"bash-tool",
	"canvas",
	"clickable-file-path",
	"confirmation",
	"connection",
	"controls",
	"edge",
	"exploring-group",
	"file-diff-tool",
	"image",
	"model-selector",
	"node",
	"open-in-chat",
	"panel",
	"prompt-input",
	"queue",
	"read-file-tool",
	"show-code",
	"text-selection-popover",
	"thinking-toggle",
	"tool",
	"tool-call",
	"tool-call-row",
	"tool-interrupted",
	"toolbar",
	"user-question-tool",
	"web-fetch-tool",
	"web-preview",
	"web-search-tool",
];

export function AiContentSection() {
	return (
		<ShowcaseSection
			id="ai-content"
			index="05"
			title="AI · Content"
			description="Rendered output: code, sources, citations, context"
		>
			<ComponentCard
				title="Code Block"
				importPath="@superset/ui/ai-elements/code-block"
				description="Shiki-highlighted, with optional line numbers"
				span
				bleed
			>
				<CodeBlock
					code={EXAMPLE_CODE}
					language="tsx"
					showLineNumbers
					className="rounded-none border-0"
				/>
			</ComponentCard>

			<ComponentCard
				title="Sources"
				importPath="@superset/ui/ai-elements/sources"
			>
				<Sources className="w-full">
					<SourcesTrigger count={3} />
					<SourcesContent>
						<Source href="#ai-content" title="Radix Tooltip docs" />
						<Source href="#ai-content" title="Tailwind v4 theme reference" />
						<Source href="#ai-content" title="shadcn/ui tooltip recipe" />
					</SourcesContent>
				</Sources>
			</ComponentCard>

			<ComponentCard
				title="Inline Citation"
				importPath="@superset/ui/ai-elements/inline-citation"
			>
				<p className="max-w-sm text-sm text-muted-foreground">
					<InlineCitation>
						<InlineCitationText>
							Radix rotates the tooltip arrow wrapper per side,
						</InlineCitationText>
						<InlineCitationCard>
							<InlineCitationCardTrigger
								sources={["https://www.radix-ui.com/primitives"]}
							/>
							<InlineCitationCardBody>
								<div className="p-3 text-sm">
									<p className="font-medium">Radix Primitives</p>
									<p className="mt-1 text-muted-foreground">
										Popper-based positioning places and rotates arrow elements
										automatically.
									</p>
								</div>
							</InlineCitationCardBody>
						</InlineCitationCard>
					</InlineCitation>{" "}
					so a border on two edges of the rotated square always faces outward.
				</p>
			</ComponentCard>

			<ComponentCard
				title="Context"
				importPath="@superset/ui/ai-elements/context"
				description="Token budget indicator — hover the percentage"
			>
				<Context usedTokens={87_400} maxTokens={200_000}>
					<ContextTrigger />
					<ContextContent>
						<ContextContentHeader />
						<ContextContentBody>
							<p className="text-xs text-muted-foreground">
								87.4K of 200K tokens used in this session.
							</p>
						</ContextContentBody>
					</ContextContent>
				</Context>
			</ComponentCard>

			<ComponentCard
				title="Checkpoint"
				importPath="@superset/ui/ai-elements/checkpoint"
			>
				<Checkpoint className="w-full">
					<CheckpointIcon />
					<CheckpointTrigger tooltip="Restore the conversation to this point">
						Checkpoint · before tooltip refactor
					</CheckpointTrigger>
				</Checkpoint>
			</ComponentCard>

			<ComponentCard
				title="Artifact"
				importPath="@superset/ui/ai-elements/artifact"
				span
				bleed
			>
				<Artifact className="rounded-none border-0">
					<ArtifactHeader>
						<div>
							<ArtifactTitle>tooltip-refactor.diff</ArtifactTitle>
							<ArtifactDescription>45 files · +82 −172</ArtifactDescription>
						</div>
						<ArtifactActions>
							<Button variant="ghost" size="icon-sm" aria-label="Download">
								<DownloadIcon />
							</Button>
							<ArtifactClose />
						</ArtifactActions>
					</ArtifactHeader>
					<div className="p-4 font-mono text-xs text-muted-foreground">
						- className="rounded-sm border border-border bg-background …"
						<br />+ {`<TooltipContent side="bottom">`}
					</div>
				</Artifact>
			</ComponentCard>

			<ComponentCard
				title="Not demoed here"
				importPath="@superset/ui/ai-elements/*"
				copyable={false}
				description="Need live chat/tool-call state (ToolUIPart, streams) or an app shell"
				span
			>
				<div className="flex flex-wrap gap-1.5">
					{NOT_DEMOED.map((module) => (
						<code
							key={module}
							className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
						>
							{module}
						</code>
					))}
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
