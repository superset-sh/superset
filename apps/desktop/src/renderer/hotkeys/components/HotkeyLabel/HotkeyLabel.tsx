import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { useHotkeyDisplay } from "../../hooks/useHotkeyDisplay";
import type { HotkeyId } from "../../registry";

export function HotkeyLabel({
	label,
	fallbackLabel,
	id,
}: {
	/** Shown next to the keys when assigned, and alone when unassigned. */
	label?: string;
	/** Keys-only tooltips: hidden when assigned, shown alone when unassigned. */
	fallbackLabel?: string;
	id?: HotkeyId;
}) {
	const { keys } = useHotkeyDisplay(id ?? ("" as HotkeyId));
	if (!id || keys[0] === "Unassigned") {
		const fallback = label ?? fallbackLabel;
		return fallback ? <span>{fallback}</span> : null;
	}
	return (
		<span className="flex items-center gap-2">
			{label}
			<KbdGroup>
				{keys.map((k) => (
					<Kbd key={k}>{k}</Kbd>
				))}
			</KbdGroup>
		</span>
	);
}
