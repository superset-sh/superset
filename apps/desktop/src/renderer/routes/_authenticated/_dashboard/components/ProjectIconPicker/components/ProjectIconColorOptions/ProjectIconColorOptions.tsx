import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { IconType } from "react-icons";
import { PROJECT_COLOR_OPTIONS } from "../../constants";

interface ProjectIconColorOptionsProps {
	Icon: IconType;
	selected: string | null;
	onPick: (color: string | null) => void;
}

export function ProjectIconColorOptions({
	Icon,
	selected,
	onPick,
}: ProjectIconColorOptionsProps) {
	const { t } = useLingui();
	return (
		<div className="grid grid-cols-5 gap-1">
			{PROJECT_COLOR_OPTIONS.map((color) => (
				<button
					key={color ?? "none"}
					type="button"
					aria-label={color ?? t({ message: "No color" })}
					onClick={() => onPick(color)}
					className={cn(
						"flex size-9 items-center justify-center rounded-md hover:bg-fill-hover",
						color === selected && "bg-fill-selected",
					)}
				>
					<Icon
						className={cn("size-5", !color && "text-muted-foreground")}
						style={color ? { color } : undefined}
					/>
				</button>
			))}
		</div>
	);
}
