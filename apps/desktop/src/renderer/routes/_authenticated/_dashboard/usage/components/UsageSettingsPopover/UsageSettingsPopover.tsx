import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuSettings2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { UsageDisplaySettings } from "../../types";

interface SettingRowProps {
	label: string;
	checked: boolean;
	disabled: boolean;
	onToggle: () => void;
}

function SettingRow({ label, checked, disabled, onToggle }: SettingRowProps) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onToggle}
			className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 disabled:opacity-50"
		>
			<span className="flex w-3.5 shrink-0 justify-center">
				<LuCheck
					className={cn("size-3.5", checked ? "opacity-100" : "opacity-0")}
				/>
			</span>
			<span className={checked ? "text-foreground" : "text-muted-foreground"}>
				{label}
			</span>
		</button>
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
				<button
					type="button"
					aria-label="Usage display settings"
					className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
				>
					<LuSettings2 className="size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-60 p-2">
				<div className="px-1.5 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">
					Usage display
				</div>
				<SettingRow
					label="Sidebar badge"
					checked={!!settings?.showSidebarBadge}
					disabled={disabled}
					onToggle={() =>
						apply({ showSidebarBadge: !settings?.showSidebarBadge })
					}
				/>
				<SettingRow
					label="Percentage in menu bar"
					checked={!!settings?.showTrayPercentage}
					disabled={disabled}
					onToggle={() =>
						apply({ showTrayPercentage: !settings?.showTrayPercentage })
					}
				/>
				<div className="my-1 border-t border-border/60" />
				<SettingRow
					label="Notify at 80% / 95% usage"
					checked={notifyEnabled}
					disabled={disabled}
					onToggle={() =>
						apply({
							notifyAt80Pct: !notifyEnabled,
							notifyAt95Pct: !notifyEnabled,
						})
					}
				/>
			</PopoverContent>
		</Popover>
	);
}
