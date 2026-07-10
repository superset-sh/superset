import type { EmojiItem } from "@tiptap/extension-emoji";
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

export interface EmojiSuggestionListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const EmojiSuggestionList = forwardRef<
	EmojiSuggestionListRef,
	SuggestionProps<EmojiItem>
>(({ items, command }, ref) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when items change
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
			if (items.length === 0) return false;

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
				if (item) command(item);
				return true;
			}
			return false;
		},
	}));

	if (items.length === 0) {
		return (
			<div className="bg-popover text-popover-foreground rounded-md border p-1 shadow-md">
				<div className="px-2 py-1.5 text-sm text-muted-foreground">
					No emoji found
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="bg-popover text-popover-foreground rounded-md border p-1 shadow-md overflow-hidden max-h-72 overflow-y-auto w-64"
		>
			{items.map((item, index) => {
				const shortcode = item.shortcodes[0] ?? item.name;
				return (
					<button
						type="button"
						key={item.name}
						data-index={index}
						onClick={() => command(item)}
						className={`relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none w-full ${
							index === selectedIndex ? "bg-accent text-accent-foreground" : ""
						}`}
					>
						<span className="w-5 shrink-0 text-base leading-none">
							{item.emoji ?? "·"}
						</span>
						<span className="flex-1 truncate text-left text-xs text-muted-foreground">
							:{shortcode}:
						</span>
					</button>
				);
			})}
		</div>
	);
});

EmojiSuggestionList.displayName = "EmojiSuggestionList";
