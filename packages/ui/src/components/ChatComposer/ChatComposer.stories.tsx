import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	ChartNoAxesColumnIcon,
	CheckIcon,
	FileCode2Icon,
	MapIcon,
	SlashSquareIcon,
	SparklesIcon,
	ZapIcon,
} from "lucide-react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ChatComposer } from "./ChatComposer";

const meta = {
	title: "Components/ChatComposer",
	component: ChatComposer,
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ChatComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

const MODELS = ["GPT-5.5", "GPT-5.5 mini", "o4"];
const EFFORTS = ["Low", "Medium", "High"];

const MENTIONS = [
	"packages/ui/src/components/ChatComposer/ChatComposer.tsx",
	"packages/ui/src/components/ChatHistorySidebar/ChatHistorySidebar.tsx",
	"packages/ui/src/components/ChatHistorySidebar/chat-history-rail.css",
	"packages/ui/src/globals.css",
	"apps/web/src/app/page.tsx",
	"apps/desktop/src/main/index.ts",
	"packages/db/src/schema/workspaces.ts",
	"README.md",
].map((path) => ({
	id: path,
	label: path,
	icon: <FileCode2Icon className="size-4" />,
}));

const COMMANDS = [
	{ id: "plan", label: "plan", description: "Draft a plan before coding" },
	{ id: "review", label: "review", description: "Review the current diff" },
	{ id: "test", label: "test", description: "Write or run tests" },
	{ id: "commit", label: "commit", description: "Commit staged changes" },
	{ id: "explain", label: "explain", description: "Explain selected code" },
].map((command) => ({
	...command,
	icon: <SlashSquareIcon className="size-4" />,
}));

function ToolbarButton({
	children,
	label,
}: {
	children: React.ReactNode;
	label: string;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			{children}
		</button>
	);
}

function DemoToolbar() {
	const [model, setModel] = useState(MODELS[0] ?? "");
	const [effort, setEffort] = useState("High");
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<SparklesIcon className="size-4" />
						{model}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{MODELS.map((candidate) => (
						<DropdownMenuItem
							key={candidate}
							onSelect={() => setModel(candidate)}
						>
							{candidate}
							{candidate === model && <CheckIcon className="ml-auto size-4" />}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			<ToolbarButton label="Turbo mode">
				<ZapIcon className="size-4" />
			</ToolbarButton>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<ChartNoAxesColumnIcon className="size-4" />
						{effort}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{EFFORTS.map((candidate) => (
						<DropdownMenuItem
							key={candidate}
							onSelect={() => setEffort(candidate)}
						>
							{candidate}
							{candidate === effort && <CheckIcon className="ml-auto size-4" />}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			<ToolbarButton label="Plan mode">
				<MapIcon className="size-4" />
			</ToolbarButton>
		</>
	);
}

function ComposerPlayground() {
	const [sent, setSent] = useState<string[]>([]);
	const [streaming, setStreaming] = useState(false);
	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end gap-3 overflow-y-auto px-6 py-8">
				{sent.map((message, index) => (
					<div
						key={`${index}-${message.slice(0, 16)}`}
						className="ml-auto max-w-[80%] rounded-2xl bg-secondary px-4 py-2.5 text-sm text-secondary-foreground"
					>
						{message}
					</div>
				))}
				{streaming && (
					<p className="text-sm text-muted-foreground">Thinking…</p>
				)}
			</div>
			<div className="mx-auto w-full max-w-3xl px-6 pb-8">
				<ChatComposer
					status={streaming ? "streaming" : "ready"}
					toolbar={<DemoToolbar />}
					mentions={MENTIONS}
					commands={COMMANDS}
					onAttach={() => {}}
					onStop={() => setStreaming(false)}
					onSubmit={(message) => {
						setSent((previous) => [...previous, message]);
						setStreaming(true);
						window.setTimeout(() => setStreaming(false), 2500);
					}}
				/>
			</div>
		</div>
	);
}

export const Default: Story = {
	render: () => <ComposerPlayground />,
};

export const Streaming: Story = {
	args: {
		status: "streaming",
		defaultValue: "",
		toolbar: undefined,
	},
	render: (args) => (
		<div className="flex h-screen items-end bg-background p-8">
			<div className="mx-auto w-full max-w-3xl">
				<ChatComposer {...args} toolbar={<DemoToolbar />} onAttach={() => {}} />
			</div>
		</div>
	),
};

export const Minimal: Story = {
	args: {
		placeholder: "Send a message",
		focusShortcut: false,
	},
	render: (args) => (
		<div className="flex h-screen items-end bg-background p-8">
			<div className="mx-auto w-full max-w-3xl">
				<ChatComposer {...args} />
			</div>
		</div>
	),
};
