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
	ContextCacheUsage,
	ContextContent,
	ContextContentBody,
	ContextContentFooter,
	ContextContentHeader,
	ContextInputUsage,
	ContextOutputUsage,
	ContextReasoningUsage,
	ContextTrigger,
} from "@superset/ui/ai-elements/context";
import {
	InlineCitation,
	InlineCitationCard,
	InlineCitationCardBody,
	InlineCitationCardTrigger,
	InlineCitationCarousel,
	InlineCitationCarouselContent,
	InlineCitationCarouselHeader,
	InlineCitationCarouselIndex,
	InlineCitationCarouselItem,
	InlineCitationCarouselNext,
	InlineCitationCarouselPrev,
	InlineCitationQuote,
	InlineCitationSource,
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
				description="Hover the badge to page through cited sources"
			>
				<p className="max-w-sm text-sm text-muted-foreground">
					<InlineCitation>
						<InlineCitationText>
							Radix rotates the tooltip arrow wrapper per side,
						</InlineCitationText>
						<InlineCitationCard>
							<InlineCitationCardTrigger
								sources={[
									"https://www.radix-ui.com/primitives/docs/components/tooltip",
									"https://floating-ui.com/docs/tutorial",
									"https://docs.superset.sh/design/tooltips",
								]}
							/>
							<InlineCitationCardBody>
								<InlineCitationCarousel>
									<InlineCitationCarouselHeader>
										<InlineCitationCarouselPrev />
										<InlineCitationCarouselIndex />
										<InlineCitationCarouselNext />
									</InlineCitationCarouselHeader>
									<InlineCitationCarouselContent>
										<InlineCitationCarouselItem>
											<InlineCitationSource
												title="Radix Primitives — Tooltip"
												url="https://www.radix-ui.com/primitives/docs/components/tooltip"
												description="Popper-based positioning places and rotates arrow elements automatically per side."
											/>
											<InlineCitationQuote>
												The arrow&apos;s rotation is derived from the resolved
												placement, not the requested one.
											</InlineCitationQuote>
										</InlineCitationCarouselItem>
										<InlineCitationCarouselItem>
											<InlineCitationSource
												title="Floating UI — Tutorial"
												url="https://floating-ui.com/docs/tutorial"
												description="The flip and shift middleware settle on a side before the arrow is placed on the floating element."
											/>
											<InlineCitationQuote>
												Arrow placement happens after collision detection
												resolves the final placement.
											</InlineCitationQuote>
										</InlineCitationCarouselItem>
										<InlineCitationCarouselItem>
											<InlineCitationSource
												title="Superset Design — Tooltip tokens"
												url="https://docs.superset.sh/design/tooltips"
												description="Internal notes on matching Radix's rotated-square arrow to our border tokens."
											/>
											<InlineCitationQuote>
												Two edges of the rotated square always face outward, so
												only those two edges take the border.
											</InlineCitationQuote>
										</InlineCitationCarouselItem>
									</InlineCitationCarouselContent>
								</InlineCitationCarousel>
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
				<Context
					usedTokens={87_400}
					maxTokens={200_000}
					modelId="anthropic/claude-sonnet-4-5"
					usage={{
						inputTokens: 62_000,
						inputTokenDetails: {
							noCacheTokens: 57_000,
							cacheReadTokens: 5_000,
							cacheWriteTokens: 0,
						},
						outputTokens: 18_400,
						outputTokenDetails: {
							textTokens: 16_400,
							reasoningTokens: 2_000,
						},
						totalTokens: 87_400,
						reasoningTokens: 2_000,
						cachedInputTokens: 5_000,
					}}
				>
					<ContextTrigger />
					<ContextContent>
						<ContextContentHeader />
						<ContextContentBody className="space-y-1.5">
							<ContextInputUsage />
							<ContextOutputUsage />
							<ContextCacheUsage />
							<ContextReasoningUsage />
						</ContextContentBody>
						<ContextContentFooter />
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
		</ShowcaseSection>
	);
}
