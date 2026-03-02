import { Extension } from "@tiptap/core";
import { type Editor, ReactRenderer } from "@tiptap/react";
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import {
	HiOutlineCheckCircle,
	HiOutlineCodeBracket,
	HiOutlineListBullet,
	HiOutlineNumberedList,
} from "react-icons/hi2";
import { RiDoubleQuotesL } from "react-icons/ri";
import tippy, { type Instance as TippyInstance } from "tippy.js";

interface CommandItem {
	title: string;
	icon: React.ReactNode;
	command: (editor: Editor) => void;
	group: "headings" | "lists" | "blocks";
}

const COMMANDS: CommandItem[] = [
	// Headings group
	{
		title: "Heading 1",
		icon: <span className="text-xs font-semibold">H₁</span>,
		command: (editor) =>
			editor.chain().focus().toggleHeading({ level: 1 }).run(),
		group: "headings",
	},
	{
		title: "Heading 2",
		icon: <span className="text-xs font-semibold">H₂</span>,
		command: (editor) =>
			editor.chain().focus().toggleHeading({ level: 2 }).run(),
		group: "headings",
	},
	{
		title: "Heading 3",
		icon: <span className="text-xs font-semibold">H₃</span>,
		command: (editor) =>
			editor.chain().focus().toggleHeading({ level: 3 }).run(),
		group: "headings",
	},
	// Lists group
	{
		title: "Bulleted list",
		icon: <HiOutlineListBullet className="size-4" />,
		command: (editor) => editor.chain().focus().toggleBulletList().run(),
		group: "lists",
	},
	{
		title: "Numbered list",
		icon: <HiOutlineNumberedList className="size-4" />,
		command: (editor) => editor.chain().focus().toggleOrderedList().run(),
		group: "lists",
	},
	{
		title: "Checklist",
		icon: <HiOutlineCheckCircle className="size-4" />,
		command: (editor) => editor.chain().focus().toggleTaskList().run(),
		group: "lists",
	},
	// Blocks group
	{
		title: "Code block",
		icon: <HiOutlineCodeBracket className="size-4" />,
		command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
		group: "blocks",
	},
	{
		title: "Blockquote",
		icon: <RiDoubleQuotesL className="size-4" />,
		command: (editor) => editor.chain().focus().toggleBlockquote().run(),
		group: "blocks",
	},
];

interface SlashCommandListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface SlashCommandListProps {
	items: CommandItem[];
	command: (item: CommandItem) => void;
}

const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
	({ items, command }, ref) => {
		const [selectedIndex, setSelectedIndex] = useState(0);
		const containerRef = useRef<HTMLDivElement>(null);

		// biome-ignore lint/correctness/useExhaustiveDependencies: Reset selection when items change
		useEffect(() => {
			setSelectedIndex(0);
		}, [items]);

		useEffect(() => {
			const selectedElement = containerRef.current?.querySelector(
				`[data-index="${selectedIndex}"]`,
			);
			selectedElement?.scrollIntoView({ block: "nearest" });
		}, [selectedIndex]);

		useImperativeHandle(ref, () => ({
			onKeyDown: ({ event }: SuggestionKeyDownProps) => {
				if (event.key === "ArrowUp") {
					setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
					return true;
				}

				if (event.key === "ArrowDown") {
					setSelectedIndex((prev) => (prev + 1) % items.length);
					return true;
				}

				if (event.key === "Enter") {
					const item = items[selectedIndex];
					if (item) {
						command(item);
					}
					return true;
				}

				return false;
			},
		}));

		if (items.length === 0) {
			return (
				<div className="bg-popover text-popover-foreground rounded-md border p-1 shadow-md">
					<div className="px-2 py-1.5 text-sm text-muted-foreground">
						No results
					</div>
				</div>
			);
		}

		// Group items
		const headings = items.filter((item) => item.group === "headings");
		const lists = items.filter((item) => item.group === "lists");
		const blocks = items.filter((item) => item.group === "blocks");

		const groups = [
			{ items: headings, key: "headings" },
			{ items: lists, key: "lists" },
			{ items: blocks, key: "blocks" },
		].filter((g) => g.items.length > 0);

		// Calculate flat index for each item
		let flatIndex = 0;
		const itemsWithIndex = groups.flatMap((group) =>
			group.items.map((item) => ({ ...item, flatIndex: flatIndex++ })),
		);

		return (
			<div
				ref={containerRef}
				className="bg-popover text-popover-foreground rounded-md border p-1 shadow-md overflow-hidden max-h-80 overflow-y-auto w-48"
			>
				{groups.map((group, groupIndex) => (
					<div key={group.key}>
						{groupIndex > 0 && <div className="bg-border -mx-1 my-1 h-px" />}
						{group.items.map((item) => {
							const itemWithIndex = itemsWithIndex.find(
								(i) => i.title === item.title,
							);
							const index = itemWithIndex?.flatIndex ?? 0;
							return (
								<button
									type="button"
									key={item.title}
									data-index={index}
									onClick={() => command(item)}
									className={`relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none w-full ${
										index === selectedIndex
											? "bg-accent text-accent-foreground"
											: ""
									}`}
								>
									<span className="text-muted-foreground shrink-0 w-5 flex items-center justify-center">
										{item.icon}
									</span>
									<span className="flex-1 text-left">{item.title}</span>
								</button>
							);
						})}
					</div>
				))}
			</div>
		);
	},
);

SlashCommandList.displayName = "SlashCommandList";

export const SlashCommand = Extension.create({
	name: "slashCommand",

	addOptions() {
		return {
			suggestion: {
				char: "/",
				decorationClass: "bg-accent/50 rounded px-0.5",
				command: ({
					editor,
					range,
					props,
				}: {
					editor: Editor;
					range: { from: number; to: number };
					props: CommandItem;
				}) => {
					editor.chain().focus().deleteRange(range).run();
					props.command(editor);
				},
			},
		};
	},

	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				...this.options.suggestion,
				allow: ({ editor: e }) => {
					return !e.isActive("codeBlock");
				},
				items: ({ query }: { query: string }) => {
					return COMMANDS.filter((item) =>
						item.title.toLowerCase().includes(query.toLowerCase()),
					);
				},
				render: () => {
					let component: ReactRenderer<SlashCommandListRef> | null = null;
					let popup: TippyInstance[] | null = null;

					return {
						onStart: (props: SuggestionProps<CommandItem>) => {
							component = new ReactRenderer(SlashCommandList, {
								props,
								editor: props.editor,
							});

							if (!props.clientRect) {
								return;
							}

							const clientRect = props.clientRect;
							popup = tippy("body", {
								getReferenceClientRect: () => clientRect?.() ?? new DOMRect(),
								appendTo: () => document.body,
								content: component.element,
								showOnCreate: true,
								interactive: true,
								trigger: "manual",
								placement: "bottom-start",
							});
						},
						onUpdate: (props: SuggestionProps<CommandItem>) => {
							component?.updateProps(props);

							if (!props.clientRect) {
								return;
							}

							const getClientRect = props.clientRect;
							popup?.[0]?.setProps({
								getReferenceClientRect: () => getClientRect() ?? new DOMRect(),
							});
						},
						onKeyDown: (props: SuggestionKeyDownProps) => {
							if (props.event.key === "Escape") {
								popup?.[0]?.hide();
								return true;
							}

							return component?.ref?.onKeyDown(props) ?? false;
						},
						onExit: () => {
							popup?.[0]?.destroy();
							component?.destroy();
						},
					};
				},
			}),
		];
	},
});
