import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { PROJECT_COLOR_OPTIONS } from "../../constants";

interface ProjectColorSwatchesProps {
	value: string | null;
	onChange: (color: string | null) => void;
}

export function ProjectColorSwatches({
	value,
	onChange,
}: ProjectColorSwatchesProps) {
	const { t } = useLingui();
	return (
		<div className="grid grid-cols-5 gap-1">
			{PROJECT_COLOR_OPTIONS.map((color) => (
				<button
					key={color ?? "none"}
					type="button"
					aria-label={color ?? t({ message: "No color" })}
					onClick={() => onChange(color)}
					className={cn(
						"flex size-8 items-center justify-center rounded-md hover:bg-fill-hover",
						color === value && "bg-fill-selected",
					)}
				>
					<span
						className={cn(
							"size-4 rounded-full",
							!color && "bg-muted-foreground/60",
						)}
						style={color ? { backgroundColor: color } : undefined}
					/>
				</button>
			))}
		</div>
	);
}
