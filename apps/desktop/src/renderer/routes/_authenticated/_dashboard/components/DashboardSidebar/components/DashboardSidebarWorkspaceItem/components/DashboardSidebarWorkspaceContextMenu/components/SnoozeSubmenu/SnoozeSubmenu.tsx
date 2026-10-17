import { useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import {
	ContextMenuItem,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import { LuAlarmClock } from "react-icons/lu";
import {
	resolveSnoozePresets,
	type SnoozePresetId,
} from "../../../../../../utils/snoozePresets";

interface SnoozeSubmenuProps {
	onSnooze: (until: number) => void;
}

export function SnoozeSubmenu({ onSnooze }: SnoozeSubmenuProps) {
	const { t } = useLingui();
	const labels: Record<SnoozePresetId, string> = {
		"in-1-hour": t({ message: "In 1 hour" }),
		"in-3-hours": t({ message: "In 3 hours" }),
		"this-evening": t({ message: "This evening" }),
		tomorrow: t({ message: "Tomorrow" }),
		"next-week": t({ message: "Next week" }),
	};
	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger>
				<LuAlarmClock className="size-4 mr-2" />
				{t({
					message: "Snooze",
					context: "Hide a sidebar workspace until a later time",
				})}
			</ContextMenuSubTrigger>
			<ContextMenuSubContent>
				{resolveSnoozePresets(new Date()).map((preset) => (
					<ContextMenuItem
						key={preset.id}
						onSelect={() => onSnooze(preset.until)}
					>
						{labels[preset.id]}
						<ContextMenuShortcut>
							{formatDateTime(
								preset.until,
								preset.id === "next-week"
									? { weekday: "short", hour: "numeric", minute: "2-digit" }
									: { hour: "numeric", minute: "2-digit" },
							)}
						</ContextMenuShortcut>
					</ContextMenuItem>
				))}
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}
