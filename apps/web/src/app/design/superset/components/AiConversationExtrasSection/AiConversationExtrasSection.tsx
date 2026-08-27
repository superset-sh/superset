"use client";

import { Canvas } from "@superset/ui/ai-elements/canvas";
import { Image } from "@superset/ui/ai-elements/image";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorLogo,
	ModelSelectorLogoGroup,
	ModelSelectorName,
	ModelSelectorSeparator,
	ModelSelectorTrigger,
} from "@superset/ui/ai-elements/model-selector";
import {
	OpenIn,
	OpenInChatGPT,
	OpenInClaude,
	OpenInContent,
	OpenInCursor,
	OpenInLabel,
	OpenInSeparator,
	OpenInT3,
	OpenInTrigger,
} from "@superset/ui/ai-elements/open-in-chat";
import {
	createPromptInputAttachmentsStore,
	PromptInput,
	PromptInputActionAddAttachments,
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuTrigger,
	PromptInputAttachment,
	type PromptInputAttachmentItem,
	PromptInputAttachments,
	PromptInputBody,
	PromptInputButton,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputProvider,
	PromptInputSpeechButton,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import {
	Queue,
	QueueItem,
	QueueItemAction,
	QueueItemActions,
	QueueItemAttachment,
	QueueItemContent,
	QueueItemDescription,
	QueueItemFile,
	QueueItemIndicator,
	QueueList,
	QueueSection,
	QueueSectionContent,
	QueueSectionLabel,
	QueueSectionTrigger,
} from "@superset/ui/ai-elements/queue";
import { TextSelectionPopover } from "@superset/ui/ai-elements/text-selection-popover";
import {
	type ThinkingLevel,
	ThinkingToggle,
} from "@superset/ui/ai-elements/thinking-toggle";
import { Toolbar } from "@superset/ui/ai-elements/toolbar";
import {
	WebPreview,
	WebPreviewBody,
	WebPreviewConsole,
	WebPreviewNavigation,
	WebPreviewNavigationButton,
	WebPreviewUrl,
} from "@superset/ui/ai-elements/web-preview";
import { Button } from "@superset/ui/button";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	ChevronsUpDownIcon,
	GitPullRequestIcon,
	PlayIcon,
	RotateCwIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { Fragment, useRef, useState } from "react";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

const GENERATED_IMAGE_BASE64 =
	"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";

const PROMPT_VALUE =
	"Add authentication middleware to the API routes, then open a PR against main";

const MODEL_GROUPS = [
	{
		provider: "anthropic" as const,
		heading: "Anthropic",
		models: ["Claude Sonnet 4.5", "Claude Opus 4"],
	},
	{
		provider: "openai" as const,
		heading: "OpenAI",
		models: ["GPT-4o"],
	},
	{
		provider: "google" as const,
		heading: "Google",
		models: ["Gemini 2.5 Pro"],
	},
];

const WEB_PREVIEW_SRC_DOC = `<!doctype html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;background:#0b0b0d;color:#f5f5f5;"><div style="text-align:center;"><div style="font-size:13px;opacity:0.6;">Dev server running</div><strong style="font-size:15px;">localhost:5173</strong></div></body></html>`;

// Seeded via createPromptInputAttachmentsStore() below, same pattern as
// apps/desktop's newWorkspaceAttachmentsStore — an external store so
// attachments render through PromptInputAttachments before any upload occurs.
const PROMPT_INPUT_DEMO_ATTACHMENTS: PromptInputAttachmentItem[] = [
	{
		id: "demo-attachment-image",
		type: "file",
		mediaType: "image/png",
		filename: "architecture.png",
		url: `data:image/png;base64,${GENERATED_IMAGE_BASE64}`,
	},
	{
		id: "demo-attachment-doc",
		type: "file",
		mediaType: "text/markdown",
		filename: "release-notes.md",
		url: "data:text/markdown;base64,",
	},
];

function ToolbarCanvasDemo() {
	return (
		<div className="h-56 w-full">
			<Canvas
				elementsSelectable={false}
				nodes={[
					{
						id: "rebase-step",
						position: { x: 0, y: 0 },
						data: { label: "Rebase onto main" },
					},
				]}
				nodesConnectable={false}
				nodesDraggable={false}
				panOnScroll={false}
				proOptions={{ hideAttribution: true }}
				zoomOnDoubleClick={false}
				zoomOnPinch={false}
				zoomOnScroll={false}
			>
				<Toolbar isVisible nodeId="rebase-step">
					<Button aria-label="Run step" size="icon-sm" variant="ghost">
						<PlayIcon className="size-3.5" />
					</Button>
					<Button aria-label="Delete step" size="icon-sm" variant="ghost">
						<Trash2Icon className="size-3.5" />
					</Button>
				</Toolbar>
			</Canvas>
		</div>
	);
}

function TextSelectionPopoverDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [lastAction, setLastAction] = useState<string | null>(null);

	return (
		<div className="w-full max-w-lg space-y-2">
			<div
				className="select-text rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
				ref={containerRef}
			>
				Select any part of this sentence — the popover that appears offers to
				ask about it or quote it into the composer.
			</div>
			<p className="h-4 text-xs text-muted-foreground">
				{lastAction ?? "Try selecting text above"}
			</p>
			<TextSelectionPopover
				containerRef={containerRef}
				onAfterAction={() => {}}
				primaryAction={{
					label: "Ask",
					onClick: (text) => setLastAction(`Ask: "${text}"`),
				}}
				secondaryAction={{
					label: "Quote",
					onClick: (text) => setLastAction(`Quote: "${text}"`),
				}}
			/>
		</div>
	);
}

function ThinkingToggleDemo() {
	const [level, setLevel] = useState<ThinkingLevel>("medium");
	return <ThinkingToggle level={level} onLevelChange={setLevel} />;
}

// Reads/clears composer state from outside <PromptInput> — the reason apps
// reach for PromptInputProvider, mirroring PromptInputResetSync in
// apps/desktop's NewWorkspaceModal.tsx (textInput.clear() + attachments.clear()
// fired from a sibling, not from inside the form).
function PromptInputProviderControls() {
	const { attachments, textInput } = usePromptInputController();

	return (
		<div className="mb-1.5 flex items-center justify-between px-1">
			<span className="text-xs text-muted-foreground">
				Controlled from outside &lt;PromptInput&gt; via PromptInputProvider
			</span>
			<Button
				className="h-6 px-2 text-xs text-muted-foreground"
				onClick={() => {
					textInput.clear();
					attachments.clear();
				}}
				size="sm"
				type="button"
				variant="ghost"
			>
				Clear
			</Button>
		</div>
	);
}

function PromptInputComposerDemo() {
	const [attachmentsStore] = useState(() => {
		const store = createPromptInputAttachmentsStore();
		store.set(PROMPT_INPUT_DEMO_ATTACHMENTS);
		return store;
	});

	return (
		<PromptInputProvider
			attachmentsStore={attachmentsStore}
			initialInput={PROMPT_VALUE}
		>
			<div className="mx-auto w-full max-w-2xl p-4">
				<PromptInputProviderControls />
				<PromptInput
					maxFileSize={10 * 1024 * 1024}
					maxFiles={5}
					multiple
					onSubmit={(_message: PromptInputMessage) => {}}
				>
					<PromptInputAttachments>
						{(file) => <PromptInputAttachment data={file} />}
					</PromptInputAttachments>
					<PromptInputBody>
						<PromptInputTextarea />
					</PromptInputBody>
					<PromptInputFooter>
						<PromptInputTools>
							<PromptInputActionMenu>
								<PromptInputActionMenuTrigger />
								<PromptInputActionMenuContent>
									<PromptInputActionAddAttachments />
								</PromptInputActionMenuContent>
							</PromptInputActionMenu>
							<PromptInputButton aria-label="Link pull request">
								<GitPullRequestIcon className="size-4" />
							</PromptInputButton>
							<PromptInputSpeechButton />
						</PromptInputTools>
						<PromptInputSubmit />
					</PromptInputFooter>
				</PromptInput>
			</div>
		</PromptInputProvider>
	);
}

export function AiConversationExtrasSection() {
	return (
		<ShowcaseSection
			description="Composer pieces, previews, and pickers that round out the chat surface"
			id="ai-conversation-extras"
			index="08"
			title="AI · Conversation extras"
		>
			<ComponentCard
				bleed
				description="PromptInputProvider-driven composer: attachment chips, toolbar button, speech input, submit"
				importPath="@superset/ui/ai-elements/prompt-input"
				span
				title="Prompt Input"
			>
				<PromptInputComposerDemo />
			</ComponentCard>

			<ComponentCard
				description="Cmd+K style picker — Dialog + Command, click to search"
				importPath="@superset/ui/ai-elements/model-selector"
				title="Model Selector"
			>
				<ModelSelector>
					<ModelSelectorTrigger asChild>
						<Button className="gap-2" type="button" variant="outline">
							<ModelSelectorLogoGroup>
								<ModelSelectorLogo provider="anthropic" />
							</ModelSelectorLogoGroup>
							Claude Sonnet 4.5
							<ChevronsUpDownIcon className="size-3.5 opacity-50" />
						</Button>
					</ModelSelectorTrigger>
					<ModelSelectorContent title="Select a model">
						<ModelSelectorInput placeholder="Search models…" />
						<ModelSelectorList>
							<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
							{MODEL_GROUPS.map((group, index) => (
								<Fragment key={group.heading}>
									{index > 0 && <ModelSelectorSeparator />}
									<ModelSelectorGroup heading={group.heading}>
										{group.models.map((model) => (
											<ModelSelectorItem key={model}>
												<ModelSelectorLogo provider={group.provider} />
												<ModelSelectorName>{model}</ModelSelectorName>
											</ModelSelectorItem>
										))}
									</ModelSelectorGroup>
								</Fragment>
							))}
						</ModelSelectorList>
					</ModelSelectorContent>
				</ModelSelector>
			</ComponentCard>

			<ComponentCard
				description="Reasoning-effort dropdown — controlled level + onLevelChange"
				importPath="@superset/ui/ai-elements/thinking-toggle"
				title="Thinking Toggle"
			>
				<ThinkingToggleDemo />
			</ComponentCard>

			<ComponentCard
				description="Follow-up prompts queued while the agent is busy, with a sent history"
				importPath="@superset/ui/ai-elements/queue"
				span
				title="Queue"
			>
				<Queue className="w-full max-w-md">
					<QueueSection defaultOpen>
						<QueueSectionTrigger>
							<QueueSectionLabel count={2} label="queued" />
						</QueueSectionTrigger>
						<QueueSectionContent>
							<QueueList>
								<QueueItem>
									<div className="flex items-start gap-1.5">
										<QueueItemIndicator />
										<QueueItemContent>
											Also add a retry-with-backoff test for the billing webhook
										</QueueItemContent>
										<QueueItemActions>
											<QueueItemAction aria-label="Remove from queue">
												<XIcon className="size-3" />
											</QueueItemAction>
										</QueueItemActions>
									</div>
									<QueueItemAttachment>
										<QueueItemFile>webhook.test.ts</QueueItemFile>
									</QueueItemAttachment>
								</QueueItem>
								<QueueItem>
									<div className="flex items-start gap-1.5">
										<QueueItemIndicator />
										<QueueItemContent>
											Update the changelog for the v1.42 canary release
										</QueueItemContent>
										<QueueItemActions>
											<QueueItemAction aria-label="Remove from queue">
												<XIcon className="size-3" />
											</QueueItemAction>
										</QueueItemActions>
									</div>
									<QueueItemDescription>
										Mention the desktop auto-update fix from #6708
									</QueueItemDescription>
								</QueueItem>
							</QueueList>
						</QueueSectionContent>
					</QueueSection>
					<QueueSection>
						<QueueSectionTrigger>
							<QueueSectionLabel count={1} label="sent" />
						</QueueSectionTrigger>
						<QueueSectionContent>
							<QueueList>
								<QueueItem>
									<div className="flex items-start gap-1.5">
										<QueueItemIndicator completed />
										<QueueItemContent completed>
											Write a PR description
										</QueueItemContent>
									</div>
								</QueueItem>
							</QueueList>
						</QueueSectionContent>
					</QueueSection>
				</Queue>
			</ComponentCard>

			<ComponentCard
				description="Renders an Experimental_GeneratedImage (base64 + mediaType)"
				importPath="@superset/ui/ai-elements/image"
				title="Image"
			>
				<Image
					alt="AI-generated landscape"
					base64={GENERATED_IMAGE_BASE64}
					className="max-w-64"
					mediaType="image/png"
					uint8Array={new Uint8Array()}
				/>
			</ComponentCard>

			<ComponentCard
				bleed
				description="Sandboxed iframe with URL bar and collapsible console"
				importPath="@superset/ui/ai-elements/web-preview"
				span
				title="Web Preview"
			>
				<WebPreview
					className="h-80 w-full rounded-none border-0"
					defaultUrl="http://localhost:5173"
				>
					<WebPreviewNavigation>
						<WebPreviewNavigationButton disabled tooltip="Back">
							<ArrowLeftIcon className="size-4" />
						</WebPreviewNavigationButton>
						<WebPreviewNavigationButton disabled tooltip="Forward">
							<ArrowRightIcon className="size-4" />
						</WebPreviewNavigationButton>
						<WebPreviewNavigationButton onClick={() => {}} tooltip="Reload">
							<RotateCwIcon className="size-4" />
						</WebPreviewNavigationButton>
						<WebPreviewUrl />
					</WebPreviewNavigation>
					<WebPreviewBody srcDoc={WEB_PREVIEW_SRC_DOC} />
					<WebPreviewConsole
						logs={[
							{
								level: "log",
								message: "[vite] connected.",
								timestamp: new Date(),
							},
							{
								level: "warn",
								message: "React Router Future Flag Warning",
								timestamp: new Date(),
							},
						]}
					/>
				</WebPreview>
			</ComponentCard>

			<ComponentCard
				description="Deep-links a query into an external chat product"
				importPath="@superset/ui/ai-elements/open-in-chat"
				title="Open in Chat"
			>
				<OpenIn query="How does packages/ui/src/components/ui/tooltip.tsx rotate its arrow per side?">
					<OpenInTrigger />
					<OpenInContent>
						<OpenInLabel>Open in</OpenInLabel>
						<OpenInSeparator />
						<OpenInClaude />
						<OpenInChatGPT />
						<OpenInT3 />
						<OpenInCursor />
					</OpenInContent>
				</OpenIn>
			</ComponentCard>

			<ComponentCard
				description="Selection-driven floating menu — select the text below to try it"
				importPath="@superset/ui/ai-elements/text-selection-popover"
				span
				title="Text Selection Popover"
			>
				<TextSelectionPopoverDemo />
			</ComponentCard>

			<ComponentCard
				bleed
				description="Floating NodeToolbar (@xyflow/react) anchored to a canvas node — also: @superset/ui/ai-elements/canvas"
				importPath="@superset/ui/ai-elements/toolbar"
				span
				title="Toolbar"
			>
				<ToolbarCanvasDemo />
			</ComponentCard>
		</ShowcaseSection>
	);
}
