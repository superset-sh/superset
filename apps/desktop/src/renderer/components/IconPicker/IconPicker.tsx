import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	HiMiniBeaker,
	HiMiniBolt,
	HiMiniBugAnt,
	HiMiniCommandLine,
	HiMiniCpuChip,
	HiMiniCube,
	HiMiniPlay,
	HiMiniRocketLaunch,
	HiMiniWrenchScrewdriver,
	HiSparkles,
} from "react-icons/hi2";
import type { ActionIconKey } from "shared/types/config";

export const ACTION_ICONS: {
	key: ActionIconKey;
	label: string;
	Icon: React.ComponentType<{ className?: string }>;
}[] = [
	{ key: "run", label: "Run", Icon: HiMiniPlay },
	{ key: "tool", label: "Tool", Icon: HiMiniWrenchScrewdriver },
	{ key: "debug", label: "Debug", Icon: HiMiniBugAnt },
	{ key: "test", label: "Test", Icon: HiMiniBeaker },
	{ key: "terminal", label: "Terminal", Icon: HiMiniCommandLine },
	{ key: "sparkles", label: "AI", Icon: HiSparkles },
	{ key: "bolt", label: "Bolt", Icon: HiMiniBolt },
	{ key: "rocket", label: "Deploy", Icon: HiMiniRocketLaunch },
	{ key: "build", label: "Build", Icon: HiMiniCube },
	{ key: "deploy", label: "Server", Icon: HiMiniCpuChip },
];

export function getIconComponent(
	key: ActionIconKey | undefined,
): React.ComponentType<{ className?: string }> {
	return ACTION_ICONS.find((i) => i.key === key)?.Icon ?? HiMiniPlay;
}

interface IconPickerProps {
	value: ActionIconKey | undefined;
	onChange: (key: ActionIconKey) => void;
	className?: string;
}

export function IconPicker({ value, onChange, className }: IconPickerProps) {
	const CurrentIcon = getIconComponent(value);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center justify-center size-10 rounded-lg bg-muted hover:bg-muted/80 border border-border/50 transition-colors shrink-0",
						"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						className,
					)}
					aria-label="Select icon"
				>
					<CurrentIcon className="size-5 text-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44">
				{ACTION_ICONS.map(({ key, label, Icon }) => (
					<DropdownMenuItem
						key={key}
						onClick={() => onChange(key)}
						className={cn(value === key && "font-medium bg-accent/50")}
					>
						<Icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
						{label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
