import { cn } from "@superset/ui/utils";
import type {
	SuggestionKeyDownProps,
	SuggestionProps,
} from "@tiptap/suggestion";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { PluginIcon } from "renderer/components/PluginIcon";
import type { PluginMentionOption } from "renderer/components/PluginMention";

export interface PluginMentionListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const PluginMentionList = forwardRef<
	PluginMentionListRef,
	SuggestionProps<PluginMentionOption>
>(({ items, command }, ref) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on new items
	useEffect(() => {
		setSelectedIndex(0);
	}, [items]);

	useEffect(() => {
		containerRef.current
			?.querySelector(`[data-index="${selectedIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	useImperativeHandle(ref, () => ({
		onKeyDown: ({ event }: SuggestionKeyDownProps) => {
			if (items.length === 0 || event.isComposing) return false;
			if (event.key === "ArrowUp") {
				setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
				return true;
			}
			if (event.key === "ArrowDown") {
				setSelectedIndex((prev) => (prev + 1) % items.length);
				return true;
			}
			if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
				const item = items[selectedIndex];
				if (item) command(item);
				return true;
			}
			return false;
		},
	}));

	// The suggestion hides the popup when nothing matches; an empty list is
	// never shown.
	return (
		<div
			ref={containerRef}
			role="listbox"
			className="max-h-80 w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{items.map((item, index) => (
				<button
					type="button"
					role="option"
					aria-selected={index === selectedIndex}
					key={item.name}
					data-index={index}
					onMouseEnter={() => setSelectedIndex(index)}
					// Focus stays in the editor; a blur would end the session before click.
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => command(item)}
					className={cn(
						"flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden select-none",
						index === selectedIndex && "bg-accent text-accent-foreground",
					)}
				>
					<PluginIcon pluginName={item.name} className="size-5 rounded-md" />
					<span className="shrink-0 font-medium">{item.displayName}</span>
					<span className="min-w-0 truncate text-muted-foreground">
						{item.description}
					</span>
				</button>
			))}
		</div>
	);
});

PluginMentionList.displayName = "PluginMentionList";
