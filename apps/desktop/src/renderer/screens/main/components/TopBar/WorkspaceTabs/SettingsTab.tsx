import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { HiMiniXMark, HiOutlineCog6Tooth } from "react-icons/hi2";
import {
	useCloseSettingsTab,
	useOpenSettings,
} from "renderer/stores/app-state";

interface SettingsTabProps {
	width: number;
	isActive: boolean;
}

export function SettingsTab({ width, isActive }: SettingsTabProps) {
	const openSettings = useOpenSettings();
	const closeSettingsTab = useCloseSettingsTab();

	return (
		<div
			className="group relative flex items-end shrink-0 h-full no-drag"
			style={{ width: `${width}px` }}
		>
			<button
				type="button"
				onClick={() => openSettings()}
				className={cn(
					"flex items-center gap-1.5 rounded-t-md transition-all w-full shrink-0 pr-6 pl-3 h-[80%]",
					isActive
						? "text-foreground bg-tertiary-active"
						: "text-muted-foreground hover:text-foreground hover:bg-tertiary/30",
				)}
			>
				<HiOutlineCog6Tooth className="size-4 shrink-0" />
				<span className="text-sm whitespace-nowrap truncate flex-1 text-left">
					Settings
				</span>
			</button>

			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={(e) => {
					e.stopPropagation();
					closeSettingsTab();
				}}
				className={cn(
					"mt-1 absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-5 group-hover:opacity-100",
					isActive ? "opacity-90" : "opacity-0",
				)}
				aria-label="Close settings"
			>
				<HiMiniXMark />
			</Button>
		</div>
	);
}
