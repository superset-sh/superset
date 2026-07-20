import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { LuSettings2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { UsageDisplaySettings } from "../../types";

interface SettingRowProps {
	label: string;
	checked: boolean;
	disabled: boolean;
	onChange: (next: boolean) => void;
}

function SettingRow({ label, checked, disabled, onChange }: SettingRowProps) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders the control
		<label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
			<span className="text-foreground">{label}</span>
			<Checkbox
				checked={checked}
				disabled={disabled}
				onCheckedChange={(value) => onChange(value === true)}
			/>
		</label>
	);
}

export function UsageSettingsPopover() {
	const utils = electronTrpc.useUtils();
	const { data: settings } = electronTrpc.usage.getSettings.useQuery();
	const updateSettings = electronTrpc.usage.updateSettings.useMutation({
		onSuccess: () => {
			utils.usage.getSettings.invalidate();
		},
	});

	const apply = (patch: Partial<UsageDisplaySettings>) => {
		updateSettings.mutate(patch);
	};

	const disabled = !settings || updateSettings.isPending;
	const notifyEnabled = !!settings?.notifyAt80Pct && !!settings?.notifyAt95Pct;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="size-8 text-muted-foreground"
					aria-label="Usage display settings"
				>
					<LuSettings2 className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 space-y-3">
				<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
					Usage display
				</div>
				<div className="space-y-2.5">
					<SettingRow
						label="Sidebar badge"
						checked={!!settings?.showSidebarBadge}
						disabled={disabled}
						onChange={(next) => apply({ showSidebarBadge: next })}
					/>
					<SettingRow
						label="Percentage in menu bar"
						checked={!!settings?.showTrayPercentage}
						disabled={disabled}
						onChange={(next) => apply({ showTrayPercentage: next })}
					/>
					<SettingRow
						label="Notify at 80% / 95% usage"
						checked={notifyEnabled}
						disabled={disabled}
						onChange={(next) =>
							apply({ notifyAt80Pct: next, notifyAt95Pct: next })
						}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}
