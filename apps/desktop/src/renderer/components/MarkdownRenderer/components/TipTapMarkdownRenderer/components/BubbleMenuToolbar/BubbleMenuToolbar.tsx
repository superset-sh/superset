import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	HiOutlineBold,
	HiOutlineCodeBracket,
	HiOutlineItalic,
	HiOutlineLink,
	HiOutlineListBullet,
	HiOutlineNumberedList,
	HiOutlineStrikethrough,
} from "react-icons/hi2";
import {
	RiCheckboxCircleLine,
	RiCodeBoxLine,
	RiDoubleQuotesL,
	RiUnderline,
} from "react-icons/ri";

interface BubbleMenuToolbarProps {
	editor: Editor;
}

function ToolbarButton({
	isActive,
	onMouseDown,
	children,
	title,
}: {
	isActive: boolean;
	onMouseDown: (e: React.MouseEvent) => void;
	children: React.ReactNode;
	title: string;
}) {
	return (
		<button
			type="button"
			title={title}
			className={`flex items-center justify-center size-7 rounded hover:bg-accent/80 ${
				isActive ? "bg-accent text-accent-foreground" : "text-foreground/80"
			}`}
			onMouseDown={onMouseDown}
		>
			{children}
		</button>
	);
}

function HeadingDropdown({ editor }: { editor: Editor }) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	const currentLevel = editor.isActive("heading", { level: 1 })
		? 1
		: editor.isActive("heading", { level: 2 })
			? 2
			: editor.isActive("heading", { level: 3 })
				? 3
				: 0;

	const label = currentLevel === 0 ? "Text" : `H${currentLevel}`;

	const handleSelect = useCallback(
		(level: number, e: React.MouseEvent) => {
			e.preventDefault();
			if (level === 0) {
				editor.chain().focus().setParagraph().run();
			} else {
				editor
					.chain()
					.focus()
					.toggleHeading({ level: level as 1 | 2 | 3 })
					.run();
			}
			setOpen(false);
		},
		[editor],
	);

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				title="Text style"
				className={`flex items-center gap-0.5 h-7 px-1.5 rounded text-xs font-medium hover:bg-accent/80 ${
					currentLevel > 0
						? "bg-accent text-accent-foreground"
						: "text-foreground/80"
				}`}
				onMouseDown={(e) => {
					e.preventDefault();
					setOpen((prev) => !prev);
				}}
			>
				{label}
				<svg
					className="size-3 opacity-60"
					viewBox="0 0 12 12"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>dropdown</title>
					<path
						d="M3 5L6 8L9 5"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			{open && (
				<div className="absolute top-full left-0 mt-1 bg-popover text-popover-foreground border rounded-md shadow-md p-1 w-36 z-50">
					{[
						{ level: 0, label: "Paragraph" },
						{ level: 1, label: "Heading 1" },
						{ level: 2, label: "Heading 2" },
						{ level: 3, label: "Heading 3" },
					].map((item) => (
						<button
							type="button"
							key={item.level}
							className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent ${
								(item.level === 0 && currentLevel === 0) ||
								currentLevel === item.level
									? "bg-accent/50"
									: ""
							}`}
							onMouseDown={(e) => handleSelect(item.level, e)}
						>
							{item.level === 0 ? (
								<span className="text-xs w-5 text-center">P</span>
							) : (
								<span className="text-xs font-semibold w-5 text-center">
									H{item.level}
								</span>
							)}
							{item.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function ListDropdown({ editor }: { editor: Editor }) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	const isAnyListActive =
		editor.isActive("bulletList") ||
		editor.isActive("orderedList") ||
		editor.isActive("taskList");

	const handleSelect = useCallback(
		(type: "bullet" | "ordered" | "task", e: React.MouseEvent) => {
			e.preventDefault();
			if (type === "bullet") {
				editor.chain().focus().toggleBulletList().run();
			} else if (type === "ordered") {
				editor.chain().focus().toggleOrderedList().run();
			} else {
				editor.chain().focus().toggleTaskList().run();
			}
			setOpen(false);
		},
		[editor],
	);

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				title="List"
				className={`flex items-center gap-0.5 h-7 px-1.5 rounded hover:bg-accent/80 ${
					isAnyListActive
						? "bg-accent text-accent-foreground"
						: "text-foreground/80"
				}`}
				onMouseDown={(e) => {
					e.preventDefault();
					setOpen((prev) => !prev);
				}}
			>
				<HiOutlineListBullet className="size-3.5" />
				<svg
					className="size-3 opacity-60"
					viewBox="0 0 12 12"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>dropdown</title>
					<path
						d="M3 5L6 8L9 5"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			{open && (
				<div className="absolute top-full left-0 mt-1 bg-popover text-popover-foreground border rounded-md shadow-md p-1 w-40 z-50">
					<button
						type="button"
						className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent ${
							editor.isActive("bulletList") ? "bg-accent/50" : ""
						}`}
						onMouseDown={(e) => handleSelect("bullet", e)}
					>
						<HiOutlineListBullet className="size-4" />
						Bullet list
					</button>
					<button
						type="button"
						className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent ${
							editor.isActive("orderedList") ? "bg-accent/50" : ""
						}`}
						onMouseDown={(e) => handleSelect("ordered", e)}
					>
						<HiOutlineNumberedList className="size-4" />
						Numbered list
					</button>
					<button
						type="button"
						className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent ${
							editor.isActive("taskList") ? "bg-accent/50" : ""
						}`}
						onMouseDown={(e) => handleSelect("task", e)}
					>
						<RiCheckboxCircleLine className="size-4" />
						Checklist
					</button>
				</div>
			)}
		</div>
	);
}

export function BubbleMenuToolbar({ editor }: BubbleMenuToolbarProps) {
	const prevent = (e: React.MouseEvent) => e.preventDefault();
	const [showLinkInput, setShowLinkInput] = useState(false);
	const [linkUrl, setLinkUrl] = useState("");
	const linkInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (showLinkInput) {
			linkInputRef.current?.focus();
		}
	}, [showLinkInput]);

	const applyLink = () => {
		const url = linkUrl.trim();
		if (url) {
			editor.chain().focus().setLink({ href: url }).run();
		}
		setShowLinkInput(false);
		setLinkUrl("");
	};

	const cancelLink = () => {
		setShowLinkInput(false);
		setLinkUrl("");
		editor.chain().focus().run();
	};

	if (showLinkInput) {
		return (
			<div className="flex items-center gap-1 bg-popover border rounded-lg shadow-md px-1.5 py-0.5">
				<HiOutlineLink className="size-3.5 text-muted-foreground shrink-0" />
				<input
					ref={linkInputRef}
					type="url"
					value={linkUrl}
					onChange={(e) => setLinkUrl(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							applyLink();
						} else if (e.key === "Escape") {
							e.preventDefault();
							cancelLink();
						}
					}}
					onBlur={cancelLink}
					placeholder="Enter URL..."
					className="bg-transparent text-sm outline-none w-48 text-foreground placeholder:text-muted-foreground"
				/>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-0.5 bg-popover border rounded-lg shadow-md px-1 py-0.5">
			<HeadingDropdown editor={editor} />

			<div className="w-px h-4 bg-border mx-0.5" />

			<ToolbarButton
				title="Bold"
				isActive={editor.isActive("bold")}
				onMouseDown={(e) => {
					prevent(e);
					editor.chain().focus().toggleBold().run();
				}}
			>
				<HiOutlineBold className="size-3.5" />
			</ToolbarButton>

			<ToolbarButton
				title="Italic"
				isActive={editor.isActive("italic")}
				onMouseDown={(e) => {
					prevent(e);
					editor.chain().focus().toggleItalic().run();
				}}
			>
				<HiOutlineItalic className="size-3.5" />
			</ToolbarButton>

			<ToolbarButton
				title="Underline"
				isActive={editor.isActive("underline")}
				onMouseDown={(e) => {
					prevent(e);
					editor.chain().focus().toggleUnderline().run();
				}}
			>
				<RiUnderline className="size-3.5" />
			</ToolbarButton>

			<ToolbarButton
				title="Strikethrough"
				isActive={editor.isActive("strike")}
				onMouseDown={(e) => {
					prevent(e);
					editor.chain().focus().toggleStrike().run();
				}}
			>
				<HiOutlineStrikethrough className="size-3.5" />
			</ToolbarButton>

			<ToolbarButton
				title="Inline code"
				isActive={editor.isActive("code")}
				onMouseDown={(e) => {
					prevent(e);
					editor.chain().focus().toggleCode().run();
				}}
			>
				<HiOutlineCodeBracket className="size-3.5" />
			</ToolbarButton>

			<div className="w-px h-4 bg-border mx-0.5" />

			<ToolbarButton
				title="Link"
				isActive={editor.isActive("link")}
				onMouseDown={(e) => {
					prevent(e);
					if (editor.isActive("link")) {
						editor.chain().focus().unsetLink().run();
					} else {
						setShowLinkInput(true);
						setLinkUrl("");
					}
				}}
			>
				<HiOutlineLink className="size-3.5" />
			</ToolbarButton>

			<ToolbarButton
				title="Blockquote"
				isActive={editor.isActive("blockquote")}
				onMouseDown={(e) => {
					prevent(e);
					editor.chain().focus().toggleBlockquote().run();
				}}
			>
				<RiDoubleQuotesL className="size-3.5" />
			</ToolbarButton>

			<ToolbarButton
				title="Code block"
				isActive={editor.isActive("codeBlock")}
				onMouseDown={(e) => {
					prevent(e);
					editor.chain().focus().toggleCodeBlock().run();
				}}
			>
				<RiCodeBoxLine className="size-3.5" />
			</ToolbarButton>

			<div className="w-px h-4 bg-border mx-0.5" />

			<ListDropdown editor={editor} />
		</div>
	);
}
