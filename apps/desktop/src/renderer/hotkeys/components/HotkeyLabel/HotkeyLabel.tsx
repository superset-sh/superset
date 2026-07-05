import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { useHotkeyDisplay } from "../../hooks/useHotkeyDisplay";
import type { HotkeyId } from "../../registry";

export function HotkeyLabel({ label, id }: { label: string; id?: HotkeyId }) {
	const { keys } = useHotkeyDisplay(id ?? ("" as HotkeyId));
	if (!id || keys[0] === "Unassigned") return <span>{label}</span>;
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
