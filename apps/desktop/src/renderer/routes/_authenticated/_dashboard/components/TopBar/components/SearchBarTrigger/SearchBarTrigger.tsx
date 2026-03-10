import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { useCallback } from "react";
import { LuSearch } from "react-icons/lu";
import { getHotkeyKeys, useHotkeyDisplay } from "renderer/stores/hotkeys";

interface SearchBarTriggerProps {
	workspaceName?: string;
}

function keyToCode(key: string): string {
	if (key.length === 1 && /^[a-z]$/i.test(key)) {
		return `Key${key.toUpperCase()}`;
	}
	if (key.length === 1 && /^\d$/.test(key)) {
		return `Digit${key}`;
	}
	return key.charAt(0).toUpperCase() + key.slice(1);
}

function dispatchHotkeyEvent(keys: string) {
	const parts = keys.toLowerCase().split("+");
	const key = parts[parts.length - 1] ?? "";
	const modifiers = new Set(parts.slice(0, -1));

	document.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			code: keyToCode(key),
			metaKey: modifiers.has("meta"),
			ctrlKey: modifiers.has("ctrl"),
			altKey: modifiers.has("alt"),
			shiftKey: modifiers.has("shift"),
			bubbles: true,
		}),
	);
}

export function SearchBarTrigger({ workspaceName }: SearchBarTriggerProps) {
	const display = useHotkeyDisplay("QUICK_OPEN");
	const isUnassigned = display.length === 1 && display[0] === "Unassigned";

	const handleClick = useCallback(() => {
		const keys = getHotkeyKeys("QUICK_OPEN");
		if (keys) {
			dispatchHotkeyEvent(keys);
		}
	}, []);

	const fullPlaceholder = workspaceName
		? `Search ${workspaceName}...`
		: "Search files...";

	return (
		<button
			type="button"
			onClick={handleClick}
			className="no-drag flex items-center gap-2 h-7 px-3 rounded-md border border-border bg-muted/50 hover:bg-muted text-muted-foreground text-sm transition-colors cursor-pointer min-w-[100px] md:min-w-[200px] max-w-[280px]"
		>
			<LuSearch className="size-3.5 shrink-0" />
			<span className="truncate text-xs hidden md:inline">
				{fullPlaceholder}
			</span>
			<span className="truncate text-xs md:hidden">Search…</span>
			{!isUnassigned && (
				<KbdGroup className="ml-auto shrink-0 hidden md:flex">
					{display.map((key) => (
						<Kbd key={key} className="text-[10px] h-4 min-w-4">
							{key}
						</Kbd>
					))}
				</KbdGroup>
			)}
		</button>
	);
}
