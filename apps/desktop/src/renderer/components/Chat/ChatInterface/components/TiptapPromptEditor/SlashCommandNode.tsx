import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

function SlashCommandChip({
	node,
	selected,
	updateAttributes,
	editor,
	getPos,
}: NodeViewProps) {
	const name = node.attrs.name as string;
	const args = (node.attrs.args as string) ?? "";
	const argumentHint = (node.attrs.argumentHint as string) ?? "";
	const argumentOptions = (node.attrs.argumentOptions as string[]) ?? [];
	const hasArgs = argumentHint.trim().length > 0;

	const inputRef = useRef<HTMLInputElement>(null);
	const [isEditing, setIsEditing] = useState(hasArgs);
	// Which item is highlighted in the dropdown — owned here so arrow keys work
	const [selectedValue, setSelectedValue] = useState<string>(
		argumentOptions[0] ?? "",
	);

	const filteredOptions = argumentOptions.filter(
		(opt) => !args || opt.toLowerCase().includes(args.toLowerCase()),
	);

	// Derive popover visibility directly from edit state — no separate comboOpen state
	// that can drift. Popover is open iff we're editing a command that has options.
	const showCombo = isEditing && filteredOptions.length > 0;

	// Keep selectedValue pointed at a valid filtered option
	useEffect(() => {
		if (
			!filteredOptions.includes(selectedValue) &&
			filteredOptions.length > 0
		) {
			setSelectedValue(filteredOptions[0] ?? "");
		}
	}, [filteredOptions, selectedValue]);

	// Focus input (with rAF so Tiptap's DOM commit has settled) whenever edit mode opens
	useEffect(() => {
		if (!isEditing || !hasArgs) return;
		const id = requestAnimationFrame(() => {
			const input = inputRef.current;
			if (!input) return;
			input.focus();
			const len = input.value.length;
			input.setSelectionRange(len, len);
		});
		return () => cancelAnimationFrame(id);
	}, [isEditing, hasArgs]);

	const exitEditMode = useCallback(() => {
		setIsEditing(false);
		const pos = getPos();
		if (pos !== undefined) {
			editor
				.chain()
				.focus()
				.setTextSelection(pos + node.nodeSize)
				.run();
		} else {
			editor.commands.focus("end");
		}
	}, [editor, getPos, node.nodeSize]);

	const handleSelectOption = useCallback(
		(value: string) => {
			updateAttributes({ args: value });
			exitEditMode();
		},
		[updateAttributes, exitEditMode],
	);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			updateAttributes({ args: e.target.value });
		},
		[updateAttributes],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Tab") {
				e.preventDefault();
				e.stopPropagation();
				if (showCombo && selectedValue) {
					handleSelectOption(selectedValue);
				} else {
					exitEditMode();
				}
				return;
			}

			if (e.key === "Enter" && showCombo && selectedValue) {
				e.preventDefault();
				e.stopPropagation();
				handleSelectOption(selectedValue);
				return;
			}

			if (e.key === "ArrowDown" && showCombo && filteredOptions.length > 0) {
				e.preventDefault();
				e.stopPropagation();
				const idx = filteredOptions.indexOf(selectedValue);
				setSelectedValue(
					filteredOptions[(idx + 1) % filteredOptions.length] ?? "",
				);
				return;
			}

			if (e.key === "ArrowUp" && showCombo && filteredOptions.length > 0) {
				e.preventDefault();
				e.stopPropagation();
				const idx = filteredOptions.indexOf(selectedValue);
				setSelectedValue(
					filteredOptions[
						(idx - 1 + filteredOptions.length) % filteredOptions.length
					] ?? "",
				);
				return;
			}

			if (
				e.key === "ArrowRight" &&
				inputRef.current?.selectionStart === args.length
			) {
				e.preventDefault();
				e.stopPropagation();
				exitEditMode();
				return;
			}

			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				setIsEditing(false);
				return;
			}

			if (e.key === "Backspace" && args === "") {
				e.preventDefault();
				e.stopPropagation();
				const pos = getPos();
				if (pos !== undefined) {
					editor
						.chain()
						.focus()
						.deleteRange({ from: pos, to: pos + node.nodeSize })
						.run();
				}
			}
		},
		[
			args,
			editor,
			exitEditMode,
			filteredOptions,
			getPos,
			handleSelectOption,
			node.nodeSize,
			selectedValue,
			showCombo,
		],
	);

	const handleInputBlur = useCallback(() => {
		setIsEditing(false);
	}, []);

	const handleChipClick = useCallback(
		(e: React.MouseEvent) => {
			if (isEditing || !hasArgs) return;
			e.preventDefault();
			e.stopPropagation();
			const pos = getPos();
			if (pos !== undefined) {
				editor.commands.setNodeSelection(pos);
			}
		},
		[isEditing, hasArgs, editor, getPos],
	);

	const handleChipDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			if (!hasArgs) return;
			e.preventDefault();
			e.stopPropagation();
			setIsEditing(true);
		},
		[hasArgs],
	);

	const placeholder = argumentHint || name;
	// Shrink to typed content once the user starts typing; show full placeholder when empty
	const displayWidth =
		args.length > 0
			? Math.max(args.length + 1, 4)
			: Math.max(placeholder.length, 4);

	return (
		<NodeViewWrapper
			as="span"
			data-node-type="slash-command"
			className="inline-block align-middle"
		>
			<Popover open={showCombo}>
				<PopoverAnchor asChild>
					{/* biome-ignore lint/a11y/useSemanticElements: cannot use <button> inside NodeViewWrapper span (invalid HTML) */}
					<span
						role="button"
						tabIndex={-1}
						contentEditable={false}
						className={cn(
							"inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-xs select-none transition-colors cursor-default",
							selected ? "bg-muted-foreground/15" : "bg-muted-foreground/10",
						)}
						onClick={handleChipClick}
						onDoubleClick={handleChipDoubleClick}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ")
								handleChipClick(e as unknown as React.MouseEvent);
						}}
					>
						<span className="text-muted-foreground">/</span>
						<span className="text-foreground/90">{name}</span>
						{hasArgs && (
							<>
								<span className="text-muted-foreground/60">:</span>
								{isEditing ? (
									<input
										ref={inputRef}
										className="bg-transparent border-none outline-none text-foreground/90 placeholder:text-muted-foreground/40 leading-none"
										style={{ width: `${displayWidth}ch` }}
										value={args}
										placeholder={placeholder}
										onChange={handleChange}
										onKeyDown={handleKeyDown}
										onBlur={handleInputBlur}
										onMouseDown={(e) => e.stopPropagation()}
										onClick={(e) => e.stopPropagation()}
									/>
								) : (
									<span
										className={cn(
											"leading-none",
											args ? "text-foreground/90" : "text-muted-foreground/40",
										)}
									>
										{args || placeholder}
									</span>
								)}
							</>
						)}
					</span>
				</PopoverAnchor>
				{argumentOptions.length > 0 && (
					<PopoverContent
						className="w-56 p-0"
						side="top"
						align="start"
						onOpenAutoFocus={(e) => e.preventDefault()}
					>
						<Command
							value={selectedValue}
							onValueChange={setSelectedValue}
							shouldFilter={false}
						>
							<CommandList>
								<CommandEmpty>No match</CommandEmpty>
								<CommandGroup>
									{filteredOptions.map((opt) => (
										<CommandItem
											key={opt}
											value={opt}
											onSelect={() => handleSelectOption(opt)}
											onMouseDown={(e) => e.preventDefault()}
										>
											{opt}
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				)}
			</Popover>
		</NodeViewWrapper>
	);
}

export const SlashCommandNode = Node.create({
	name: "slash-command",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			name: {
				default: null,
				parseHTML: (el) => el.getAttribute("data-name"),
				renderHTML: (attrs) => ({ "data-name": attrs.name }),
			},
			args: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-args") ?? "",
				renderHTML: (attrs) => (attrs.args ? { "data-args": attrs.args } : {}),
			},
			argumentHint: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-argument-hint") ?? "",
				renderHTML: (attrs) =>
					attrs.argumentHint
						? { "data-argument-hint": attrs.argumentHint }
						: {},
			},
			argumentOptions: {
				default: [],
				parseHTML: (el) => {
					const raw = el.getAttribute("data-argument-options");
					if (!raw) return [];
					try {
						return JSON.parse(raw);
					} catch {
						return [];
					}
				},
				renderHTML: (attrs) => {
					if (!attrs.argumentOptions?.length) return {};
					return {
						"data-argument-options": JSON.stringify(attrs.argumentOptions),
					};
				},
			},
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-type="slash-command"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes({ "data-type": "slash-command" }, HTMLAttributes),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(SlashCommandChip);
	},
});
