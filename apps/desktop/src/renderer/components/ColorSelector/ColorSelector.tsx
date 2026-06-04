import { ContextMenuItem } from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { HiCheck } from "react-icons/hi2";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";

type ColorSelectorVariant = "inline" | "menu";

interface ColorSelectorProps {
	selectedColor?: string | null;
	onSelectColor: (color: string) => void;
	variant?: ColorSelectorVariant;
	className?: string;
}

function renderColorSwatch(colorValue: string, variant: ColorSelectorVariant) {
	const isDefault = colorValue === PROJECT_COLOR_DEFAULT;

	return (
		<span
			className={cn(
				"relative inline-flex shrink-0 items-center justify-center rounded-full border",
				variant === "inline" ? "size-5" : "size-3.5",
				isDefault ? "border-border bg-background" : "border-border/50",
			)}
			style={isDefault ? undefined : { backgroundColor: colorValue }}
		>
			{isDefault ? (
				<span
					className={cn(
						"rounded-full bg-muted-foreground/35",
						variant === "inline" ? "size-2.5" : "size-1.5",
					)}
				/>
			) : null}
		</span>
	);
}

export function ColorSelector({
	selectedColor,
	onSelectColor,
	variant = "inline",
	className,
}: ColorSelectorProps) {
	const selectedValue = selectedColor ?? PROJECT_COLOR_DEFAULT;

	if (variant === "menu") {
		return (
			<>
				{PROJECT_COLORS.map((color) => {
					const isSelected = selectedValue === color.value;

					return (
						<ContextMenuItem
							key={color.value}
							onSelect={() => onSelectColor(color.value)}
							className="flex items-center gap-2"
						>
							{renderColorSwatch(color.value, variant)}
							<span>{color.name}</span>
							{isSelected ? (
								<HiCheck className="ml-auto size-3.5 text-muted-foreground" />
							) : null}
						</ContextMenuItem>
					);
				})}
			</>
		);
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)}>
			{PROJECT_COLORS.map((color) => {
				const isSelected = selectedValue === color.value;

				return (
					<button
						key={color.value}
						type="button"
						title={color.name}
						aria-label={`Set color to ${color.name}`}
						aria-pressed={isSelected}
						onClick={() => onSelectColor(color.value)}
						className={cn(
							"flex size-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							isSelected ? "scale-110 border-foreground" : "border-transparent",
						)}
					>
						{renderColorSwatch(color.value, variant)}
					</button>
				);
			})}
		</div>
	);
}
