import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check } from "lucide-react";

const PRESETS = [
	{ id: "hourly", label: msg({ message: "Hourly" }) },
	{ id: "daily", label: msg({ message: "Daily" }) },
	{ id: "weekdays", label: msg({ message: "Weekdays" }) },
	{ id: "weekly", label: msg({ message: "Weekly" }) },
	{ id: "custom", label: msg({ message: "Custom" }) },
];

export function SchedulePicker() {
	const { t } = useLingui();

	return (
		<div className="absolute right-4 bottom-4 left-4 overflow-hidden rounded-md border border-border bg-popover text-sm shadow-xl sm:right-8 sm:bottom-8 sm:left-auto sm:w-80">
			<p className="px-3 pt-2.5 pb-1.5 font-medium text-xs">
				<Trans>Schedule</Trans>
			</p>
			<div className="flex flex-wrap gap-1.5 px-3 pb-3 text-xs">
				{PRESETS.map((preset) => {
					const selected = preset.id === "weekly";
					return (
						<span
							key={preset.id}
							className={`flex items-center gap-1 rounded-md border px-2 py-1 ${selected ? "border-foreground/40 bg-accent text-foreground" : "border-border text-muted-foreground"}`}
						>
							{selected && <Check className="size-3" />}
							{t(preset.label)}
						</span>
					);
				})}
			</div>
			<div className="space-y-1 border-border border-t px-3 py-2.5 text-xs">
				<p className="break-all font-mono text-[11px] text-foreground">
					FREQ=WEEKLY;BYDAY=MO;BYHOUR=8;BYMINUTE=0
				</p>
				<p className="text-muted-foreground">
					<Trans>Times use your time zone.</Trans>
				</p>
			</div>
		</div>
	);
}
