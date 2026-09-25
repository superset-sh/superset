import { MessageScroller } from "@shadcn/react/message-scroller";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	type ChatHistorySidebarMessage,
	ChatHistorySidebarScroller,
} from "@superset/ui/chat-history-sidebar";
import { getPresetIcon } from "@superset/ui/icons/preset-icons";
import {
	BoxIcon,
	ChartNoAxesColumnIcon,
	CircleDashedIcon,
	DatabaseIcon,
	FileCode2Icon,
	FilePlus2Icon,
	FolderIcon,
	GitCompareArrowsIcon,
	GitPullRequestArrowIcon,
	LightbulbIcon,
	MessageSquarePlusIcon,
	MessagesSquareIcon,
	PaperclipIcon,
	ServerIcon,
	ShieldCheckIcon,
	SparklesIcon,
	SplitIcon,
	ZapIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { ComposerDropZone } from "../ComposerDropZone";
import { ScrollToBottomButton } from "../ScrollToBottomButton";
import { PromptInput } from "./PromptInput";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
	PromptInputAttachment,
	PromptInputCommand,
	PromptInputSubmitPayload,
} from "./types";

const REPO_DIRS = [
	"packages/",
	"packages/chat-ui/",
	"packages/chat-ui/src/",
	"packages/chat/",
	"packages/ui/",
	"apps/",
	"apps/desktop/",
	"apps/web/",
];

const REPO_FILES = [
	"packages/chat-ui/src/components/PromptInput/PromptInput.tsx",
	"packages/chat-ui/src/components/PromptInput/types.ts",
	"packages/chat/src/protocol/items.ts",
	"packages/ui/src/components/ChatHistorySidebar/ChatHistorySidebar.tsx",
	"apps/desktop/src/main/index.ts",
	"apps/web/src/app/page.tsx",
	"README.md",
	"package.json",
];

const SKILLS = [
	{
		id: "create-pr",
		label: "create-pr",
		description: "Open a pull request",
		color: "#16A34A",
		icon: <GitPullRequestArrowIcon className="size-5" strokeWidth={1.75} />,
	},
	{
		id: "db-migrations",
		label: "db-migrations",
		description: "Drizzle migration workflow",
		color: "#2563EB",
		icon: <DatabaseIcon className="size-5" strokeWidth={1.75} />,
	},
	{
		id: "ci-check",
		label: "ci-check",
		description: "Lint, typecheck, test",
		color: "#9333EA",
		icon: <ShieldCheckIcon className="size-5" strokeWidth={1.75} />,
	},
];

const WORKSPACES = ["woolly-smoke", "quiet-fjord", "amber-basin"];

const CONVERSATIONS = [
	{
		id: "conv-1",
		title: "Fix rail follow-scroll at transcript bottom",
		agent: "claude",
		agentLabel: "Claude Code",
		workspace: "woolly-smoke",
	},
	{
		id: "conv-2",
		title: "Composer bake-off: Lexical vs Tiptap",
		agent: "claude",
		agentLabel: "Claude Code",
		workspace: "woolly-smoke",
	},
	{
		id: "conv-3",
		title: "Investigate relay reconnect loop",
		agent: "codex",
		agentLabel: "Codex",
		workspace: "quiet-fjord",
	},
	{
		id: "conv-4",
		title: "Ship provider-based mention registry",
		agent: "copilot",
		agentLabel: "Copilot",
		workspace: "amber-basin",
	},
];

const PLUGINS = [
	{
		id: "docs",
		label: "Google Docs",
		description: "Draft and edit documents",
		domain: "docs.google.com",
	},
	{
		id: "figma",
		label: "Figma",
		description: "Inspect designs and export assets",
		domain: "figma.com",
	},
	{
		id: "github",
		label: "GitHub",
		description: "Triage PRs, issues, and CI",
		domain: "github.com",
	},
	{
		id: "linear",
		label: "Linear",
		description: "Create and update issues",
		domain: "linear.app",
	},
	{
		id: "gmail",
		label: "Gmail",
		description: "Read and manage email",
		domain: "gmail.com",
	},
];

function Favicon({ domain }: { domain: string }) {
	return (
		<img
			src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
			alt=""
			className="size-5 rounded-[5px]"
		/>
	);
}

function PresetIcon({ name }: { name: string }) {
	return (
		<img
			src={getPresetIcon(name, true)}
			alt=""
			className="size-4.5 rounded-[4px]"
		/>
	);
}

function pluginsProvider(priority: number): ComposerMentionProvider {
	return {
		id: "plugins",
		title: "Plugins",
		priority,
		source: {
			kind: "static",
			load: () =>
				PLUGINS.map((plugin) => ({
					id: plugin.id,
					label: plugin.label,
					description: plugin.description,
					icon: <Favicon domain={plugin.domain} />,
					select: (ctx) =>
						ctx.insertChip({
							label: plugin.label,
							serialized: `plugin://${plugin.id}`,
							iconUrl: `https://www.google.com/s2/favicons?domain=${plugin.domain}&sz=64`,
							data: { plugin: plugin.id },
						}),
				})),
		},
	};
}

function fileSearchProvider(priority: number): ComposerMentionProvider {
	return {
		id: "files",
		title: "Files",
		priority,
		source: {
			kind: "search",
			emptyState: "Type to search files",
			loadingState: "Searching files\u2026",
			search: async (query) => {
				await new Promise((resolve) => setTimeout(resolve, 90));
				const lowered = query.toLowerCase();
				const dirs = REPO_DIRS.filter(
					(dir) => dir.toLowerCase().startsWith(lowered) && dir !== query,
				).map(
					(dir): ComposerMentionEntry => ({
						id: `dir:${dir}`,
						label: dir,
						description: "Directory",
						icon: <FolderIcon className="size-4.5" />,
						select: (ctx) =>
							ctx.insertChip({
								label: dir,
								serialized: `@${dir}`,
								data: { directory: true },
							}),
					}),
				);
				const files = REPO_FILES.filter((path) =>
					path.toLowerCase().includes(lowered),
				).map(
					(path): ComposerMentionEntry => ({
						id: path,
						label: path,
						icon: <FileCode2Icon className="size-4.5" />,
						select: (ctx) =>
							ctx.insertChip({ label: path, serialized: `@${path}` }),
					}),
				);
				return [...dirs, ...files].slice(0, 8);
			},
		},
	};
}

function skillsProvider(priority: number): ComposerMentionProvider {
	return {
		id: "skills",
		title: "Skills",
		priority,
		source: {
			kind: "static",
			load: () =>
				SKILLS.map((skill) => ({
					id: skill.id,
					label: skill.label,
					description: skill.description,
					icon: skill.icon,
					select: (ctx) =>
						ctx.insertChip({
							label: skill.label,
							serialized: `$${skill.label}`,
							brandColor: skill.color,
						}),
				})),
		},
	};
}

function workspacesProvider(priority: number): ComposerMentionProvider {
	return {
		id: "workspaces",
		title: "Workspaces",
		priority,
		source: {
			kind: "static",
			load: async () => {
				await new Promise((resolve) => setTimeout(resolve, 120));
				return WORKSPACES.map((name) => ({
					id: name,
					label: name,
					description: "Workspace",
					icon: <PresetIcon name="superset" />,
					select: (ctx) =>
						ctx.insertChip({
							label: name,
							serialized: `workspace://${name}`,
							iconUrl: getPresetIcon("superset", true),
							data: { workspace: name },
						}),
				}));
			},
		},
	};
}

function conversationsProvider(priority: number): ComposerMentionProvider {
	return {
		id: "conversations",
		title: "Conversations",
		priority,
		source: {
			kind: "static",
			load: async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				return CONVERSATIONS.map((conversation) => ({
					id: conversation.id,
					label: conversation.title,
					description: `${conversation.agentLabel} · ${conversation.workspace}`,
					icon: <PresetIcon name={conversation.agent} />,
					keywords: [conversation.agentLabel, conversation.workspace],
					select: (ctx) =>
						ctx.insertChip({
							label: conversation.title,
							serialized: `conversation://${conversation.id}`,
							iconUrl: getPresetIcon(conversation.agent, true),
							data: {
								conversationId: conversation.id,
								agent: conversation.agent,
							},
						}),
				}));
			},
		},
	};
}

function addProvider(
	priority: number,
	setPlanMode: (on: boolean) => void,
): ComposerMentionProvider {
	return {
		id: "add",
		title: "Add",
		priority,
		source: {
			kind: "static",
			load: () => [
				{
					id: "files-and-folders",
					label: "Files and folders",
					icon: <PaperclipIcon className="size-4.5" />,
					select: (ctx) => ctx.attachFiles(),
				},
				{
					id: "plan-mode",
					label: "Plan mode",
					description: "Turn plan mode on",
					icon: <LightbulbIcon className="size-4.5" />,
					select: () => setPlanMode(true),
				},
			],
		},
	};
}

const SKILL_COMMANDS = SKILLS.map(
	(skill): PromptInputCommand => ({
		id: `skill:${skill.id}`,
		title: skill.label,
		description: skill.description,
		icon: skill.icon,
		group: "Skills",
		onSelect: (ctx) =>
			ctx.insertChip({
				label: skill.label,
				serialized: `$${skill.label}`,
				brandColor: skill.color,
			}),
	}),
);

const COMMANDS: PromptInputCommand[] = [
	{
		id: "compact",
		title: "Compact",
		description: "Compact this conversation's context",
		icon: <CircleDashedIcon className="size-4.5" />,
		searchAliases: ["summarize"],
		onSelect: () => {},
	},
	{
		id: "new-chat",
		title: "New chat",
		description: "Start a blank chat in this workspace",
		icon: <MessageSquarePlusIcon className="size-4.5" />,
		searchAliases: ["blank"],
		onSelect: () => {},
	},
	...SKILL_COMMANDS,
];

function DemoToolbar({
	planMode,
	model,
}: {
	planMode: boolean;
	model: string;
}) {
	return (
		<>
			<button
				type="button"
				className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<SparklesIcon className="size-4" />
				{model}
			</button>
			<button
				type="button"
				className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<ChartNoAxesColumnIcon className="size-4" />
				High
			</button>
			{planMode && (
				<span className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-amber-500">
					<LightbulbIcon className="size-4" />
					Plan mode
				</span>
			)}
		</>
	);
}

const meta = {
	component: PromptInput,
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PromptInput>;

export default meta;
type Story = StoryObj<typeof meta>;

let messageId = 0;
const nextId = () => `m${messageId++}`;

const SEED_EXCHANGES: Array<[string, string]> = [
	[
		"Can you port the chat history rail from the reference app?",
		"Done — the rail is a pure CSS scaleX falloff over sibling rows, with a hover card anchored per row. It's in packages/ui with Storybook coverage.",
	],
	[
		"Now the composer — file mentions, slash commands, drag and drop",
		"Built on Lexical with a provider-based mention registry: static sources load at mount, search sources query per keystroke with abort. Chips serialize as typed labels.",
	],
	[
		"How does it compare to the reference implementation?",
		"Item and section shapes converged almost exactly. We kept a provider registry at the component boundary since chat-ui feeds three apps; they hard-code sections because they're a single app.",
	],
];

const SEED_MESSAGES: ChatHistorySidebarMessage[] = SEED_EXCHANGES.flatMap(
	([user, assistant]) => [
		{ id: nextId(), role: "user" as const, preview: user },
		{ id: nextId(), role: "assistant" as const, preview: assistant },
	],
);

function ChatScreen() {
	const [messages, setMessages] =
		useState<ChatHistorySidebarMessage[]>(SEED_MESSAGES);
	const [streaming, setStreaming] = useState(false);
	const [planMode, setPlanMode] = useState(false);
	const [model, setModel] = useState("Sonnet 5");
	// App-owned attachment click handling: images get a lightbox here; a real
	// surface might open files in the editor instead.
	const [preview, setPreview] = useState<PromptInputAttachment | null>(null);
	const [fileNotice, setFileNotice] = useState<string | null>(null);
	const [providers] = useState<ComposerMentionProvider[]>(() => [
		addProvider(0, setPlanMode),
		pluginsProvider(1),
		skillsProvider(2),
		workspacesProvider(3),
		conversationsProvider(4),
		fileSearchProvider(5),
	]);

	const noticeTimerRef = useRef<number | null>(null);
	const showNotice = (text: string) => {
		setFileNotice(text);
		if (noticeTimerRef.current != null)
			window.clearTimeout(noticeTimerRef.current);
		noticeTimerRef.current = window.setTimeout(() => setFileNotice(null), 2500);
	};

	const commands: PromptInputCommand[] = [
		{
			id: "plan",
			title: "Plan",
			description: planMode
				? "Turn off plan mode"
				: "Plan before making changes",
			icon: <LightbulbIcon className="size-4.5" />,
			onSelect: () => setPlanMode((previous) => !previous),
		},
		{
			id: "model",
			title: "Model",
			description: model,
			icon: <BoxIcon className="size-4.5" />,
			onSelect: () =>
				setModel((previous) =>
					previous === "Sonnet 5" ? "Opus 5" : "Sonnet 5",
				),
		},
		{
			id: "compact",
			title: "Compact",
			description: "Compact this conversation's context",
			icon: <CircleDashedIcon className="size-4.5" />,
			searchAliases: ["summarize"],
			onSelect: () => showNotice("Compacted the conversation context"),
		},
		{
			id: "new-chat",
			title: "New chat",
			description: "Start a blank chat in this workspace",
			icon: <MessageSquarePlusIcon className="size-4.5" />,
			searchAliases: ["blank"],
			onSelect: () => showNotice("Would start a new chat"),
		},
		{
			id: "review",
			title: "Review",
			description: "Review the current diff",
			icon: <GitCompareArrowsIcon className="size-4.5" />,
			onSelect: () => showNotice("Would start a code review"),
		},
		{
			id: "continue",
			title: "Continue in new chat",
			description: "Carry this context into a fresh chat",
			icon: <SplitIcon className="size-4.5" />,
			onSelect: () => showNotice("Would continue in a new chat"),
		},
		{
			id: "fast",
			title: "Fast",
			description: "Toggle faster responses",
			icon: <ZapIcon className="size-4.5" />,
			onSelect: () => showNotice("Would toggle fast mode"),
		},
		{
			id: "feedback",
			title: "Feedback",
			description: "Send feedback about this chat",
			icon: <MessagesSquareIcon className="size-4.5" />,
			onSelect: () => showNotice("Would open the feedback form"),
		},
		{
			id: "init",
			title: "Init",
			description: "Create an AGENTS.md for this repo",
			icon: <FilePlus2Icon className="size-4.5" />,
			onSelect: () => showNotice("Would draft AGENTS.md"),
		},
		{
			id: "mcp",
			title: "MCP",
			description: "Show MCP server status",
			icon: <ServerIcon className="size-4.5" />,
			onSelect: () => showNotice("Would show MCP status"),
		},
		...SKILL_COMMANDS,
	];

	const handleSubmit = ({ text, mentions }: PromptInputSubmitPayload) => {
		setMessages((previous) => [
			...previous,
			{ id: nextId(), role: "user", preview: text },
		]);
		setStreaming(true);
		window.setTimeout(() => {
			setMessages((previous) => [
				...previous,
				{
					id: nextId(),
					role: "assistant",
					preview:
						mentions.length > 0
							? `On it — I'll start from ${mentions.map((m) => m.label).join(", ")}.`
							: "On it.",
				},
			]);
			setStreaming(false);
		}, 1400);
	};

	return (
		<ComposerDropZone className="flex h-screen bg-background text-foreground">
			<MessageScroller.Provider autoScroll defaultScrollPosition="end">
				<div className="flex w-16 shrink-0 items-center pl-3">
					<ChatHistorySidebarScroller messages={messages} />
				</div>
				<MessageScroller.Root className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
					<MessageScroller.Viewport className="flex flex-1 flex-col overflow-y-auto">
						<MessageScroller.Content className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
							{messages.map((message) => (
								<MessageScroller.Item
									key={message.id}
									messageId={message.id}
									scrollAnchor={message.role === "user"}
									className={
										message.role === "user"
											? "ml-auto max-w-[80%] rounded-2xl bg-secondary px-4 py-2.5 text-sm text-secondary-foreground"
											: "text-sm leading-relaxed text-foreground/90"
									}
								>
									{message.preview}
								</MessageScroller.Item>
							))}
							{streaming && (
								<p className="text-sm text-muted-foreground">Thinking…</p>
							)}
						</MessageScroller.Content>
					</MessageScroller.Viewport>
					<div className="relative mx-auto w-full max-w-3xl px-6 pb-[18px]">
						<div className="pointer-events-none absolute inset-x-0 -top-12 flex justify-center">
							<ScrollToBottomButton />
						</div>
						{fileNotice && (
							<p className="pb-2 text-xs text-muted-foreground">{fileNotice}</p>
						)}
						<PromptInput
							placeholder="Ask to make changes, @mention files, run /commands"
							mentionProviders={providers}
							commands={commands}
							dictation={{
								transcribe: async () => {
									const shouldFail = (window as { __failTranscribe?: boolean })
										.__failTranscribe;
									await new Promise((resolve) => setTimeout(resolve, 900));
									if (shouldFail) throw new Error("fetch failed");
									return "Tighten the composer spacing and ship it.";
								},
								onError: (error) => showNotice(error.message),
							}}
							status={streaming ? "streaming" : "ready"}
							toolbar={<DemoToolbar planMode={planMode} model={model} />}
							onStop={() => setStreaming(false)}
							onSubmit={handleSubmit}
							onAttachmentClick={(attachment) => {
								if (attachment.previewUrl) {
									setPreview(attachment);
								} else {
									showNotice(
										`Would open ${attachment.file.name} in your editor`,
									);
								}
							}}
							onChipClick={(chip) => showNotice(`Would open ${chip.label}`)}
						/>
					</div>
				</MessageScroller.Root>
			</MessageScroller.Provider>
			{preview?.previewUrl && (
				// biome-ignore lint/a11y/useKeyWithClickEvents: demo lightbox, backdrop dismissal
				// biome-ignore lint/a11y/noStaticElementInteractions: demo lightbox, backdrop dismissal
				<div
					className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-background/80 p-10 backdrop-blur-sm"
					onClick={() => setPreview(null)}
				>
					<img
						src={preview.previewUrl}
						alt={preview.file.name}
						className="max-h-full max-w-full rounded-xl shadow-2xl"
					/>
				</div>
			)}
		</ComposerDropZone>
	);
}

function ComposerOnly() {
	const [providers] = useState<ComposerMentionProvider[]>(() => [
		pluginsProvider(0),
		skillsProvider(1),
		workspacesProvider(2),
		conversationsProvider(3),
		fileSearchProvider(4),
	]);
	return (
		<div className="flex min-h-screen items-end justify-center bg-background px-6 pb-10 text-foreground">
			<div className="w-full max-w-3xl">
				<PromptInput
					placeholder="Ask to make changes, @mention files, run /commands"
					mentionProviders={providers}
					commands={COMMANDS}
					dictation={{
						transcribe: async () => {
							const shouldFail = (window as { __failTranscribe?: boolean })
								.__failTranscribe;
							await new Promise((resolve) => setTimeout(resolve, 900));
							if (shouldFail) throw new Error("fetch failed");
							return "Tighten the composer spacing and ship it.";
						},
					}}
					onSubmit={() => {}}
					onAttachmentClick={() => {}}
					onChipClick={() => {}}
				/>
			</div>
		</div>
	);
}

// Speech-like synthetic mic input so the story needs no permission prompt.
function stubMicrophone() {
	const context = new AudioContext();
	const oscillator = context.createOscillator();
	const gain = context.createGain();
	const burst = context.createOscillator();
	const burstDepth = context.createGain();
	const destination = context.createMediaStreamDestination();
	oscillator.frequency.value = 220;
	gain.gain.value = 0.4;
	burst.frequency.value = 1.6;
	burstDepth.gain.value = 0.4;
	burst.connect(burstDepth);
	burstDepth.connect(gain.gain);
	oscillator.connect(gain);
	gain.connect(destination);
	oscillator.start();
	burst.start();
	navigator.mediaDevices.getUserMedia = async () => destination.stream;
}

export const Default: Story = {
	args: { mentionProviders: [], commands: COMMANDS },
	render: () => <ChatScreen />,
};

export const Recording: Story = {
	args: { mentionProviders: [], commands: COMMANDS },
	render: () => <ComposerOnly />,
	play: async ({ canvasElement }) => {
		stubMicrophone();
		canvasElement
			.querySelector<HTMLButtonElement>('[aria-label="Dictate"]')
			?.click();
	},
};

export const DictationError: Story = {
	args: { mentionProviders: [], commands: COMMANDS },
	render: () => <ComposerOnly />,
	play: async ({ canvasElement }) => {
		stubMicrophone();
		const flags = window as { __failTranscribe?: boolean };
		flags.__failTranscribe = true;
		canvasElement
			.querySelector<HTMLButtonElement>('[aria-label="Dictate"]')
			?.click();
		await new Promise((resolve) => setTimeout(resolve, 1200));
		canvasElement
			.querySelector<HTMLButtonElement>('[aria-label="Stop dictation"]')
			?.click();
		// Let the failing transcription land, then "restore the connection"
		// so the retry button succeeds.
		await new Promise((resolve) => setTimeout(resolve, 2000));
		flags.__failTranscribe = false;
	},
};

export const BrowseMenu: Story = {
	args: { mentionProviders: [], commands: COMMANDS },
	render: () => <ComposerOnly />,
	play: async ({ canvasElement }) => {
		canvasElement
			.querySelector<HTMLButtonElement>(
				'[aria-label="Add files, apps, and more"]',
			)
			?.click();
	},
};

export const WithAttachments: Story = {
	args: { mentionProviders: [], commands: COMMANDS },
	render: () => <ComposerOnly />,
	play: async ({ canvasElement }) => {
		const canvas = document.createElement("canvas");
		canvas.width = 64;
		canvas.height = 64;
		const context = canvas.getContext("2d");
		if (context) {
			context.fillStyle = "#0ea5e9";
			context.fillRect(0, 0, 64, 64);
			context.fillStyle = "#f59e0b";
			context.beginPath();
			context.arc(32, 32, 18, 0, Math.PI * 2);
			context.fill();
		}
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/png"),
		);
		const transfer = new DataTransfer();
		if (blob)
			transfer.items.add(
				new File([blob], "screenshot.png", { type: "image/png" }),
			);
		transfer.items.add(new File(["{}"], "bun.lock", { type: "" }));
		canvasElement.querySelector(".prompt-input-editor")?.dispatchEvent(
			new DragEvent("drop", {
				bubbles: true,
				cancelable: true,
				dataTransfer: transfer,
			}),
		);
	},
};
