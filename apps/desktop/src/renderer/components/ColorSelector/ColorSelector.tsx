import { useLingui } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { HiCheck } from "react-icons/hi2";
import { isHexColor } from "renderer/lib/project-accent";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLOR_VALUES,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import { CustomColorInput } from "./components/CustomColorInput";

const CUSTOM_SWATCH_BACKGROUND =
	"conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)";

type ColorSelectorVariant = "inline" | "menu";

interface ColorSelectorProps {
	selectedColor?: string | null;
	onSelectColor: (color: string) => void;
	variant?: ColorSelectorVariant;
	/** Prepend a "Default" (no color) swatch; selects PROJECT_COLOR_DEFAULT. */
	includeDefault?: boolean;
	/** Disable all swatches (e.g. while a selection is persisting). */
	disabled?: boolean;
	/** Inline only: append a swatch that opens the native color picker. */
	allowCustom?: boolean;
	/**
	 * Menu only: append a "Custom…" item. A menu closes on select, so the
	 * caller owns the picker input and opens it here.
	 */
	onPickCustom?: () => void;
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
	includeDefault = false,
	disabled = false,
	allowCustom = false,
	onPickCustom,
	className,
}: ColorSelectorProps) {
	const { t } = useLingui();
	const selectedValue = selectedColor ?? PROJECT_COLOR_DEFAULT;
	const customColor =
		isHexColor(selectedColor) &&
		!PROJECT_COLOR_VALUES.includes(selectedColor.toLowerCase())
			? selectedColor
			: null;
	const colors: { name: string; value: string }[] = [
		...(includeDefault
			? [
					{
						name: t({
							message: "Default",
						}),
						value: PROJECT_COLOR_DEFAULT,
					},
				]
			: []),
		...PROJECT_COLORS.map((color) => ({
			name: color.name(),
			value: color.value,
		})),
	];

	if (variant === "menu") {
		return (
			<>
				{colors.map((color) => {
					const isSelected = selectedValue === color.value;

					return (
						<ContextMenuItem
							key={color.value}
							disabled={disabled}
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
				{onPickCustom ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							disabled={disabled}
							onSelect={onPickCustom}
							className="flex items-center gap-2"
						>
							<span
								className="size-3.5 shrink-0 rounded-full border border-border/50"
								style={{
									background: customColor ?? CUSTOM_SWATCH_BACKGROUND,
								}}
							/>
							<span>{t({ message: "Custom…" })}</span>
							{customColor ? (
								<HiCheck className="ml-auto size-3.5 text-muted-foreground" />
							) : null}
						</ContextMenuItem>
					</>
				) : null}
			</>
		);
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)}>
			{colors.map((color) => {
				const isSelected = selectedValue === color.value;

				return (
					<button
						key={color.value}
						type="button"
						title={color.name}
						aria-label={t({
							message: `Set color to ${color.name}`,
						})}
						aria-pressed={isSelected}
						disabled={disabled}
						onClick={() => onSelectColor(color.value)}
						className={cn(
							"flex size-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							"disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
							isSelected ? "scale-110 border-foreground" : "border-transparent",
						)}
					>
						{renderColorSwatch(color.value, variant)}
					</button>
				);
			})}
			{allowCustom ? (
				<div
					title={t({ message: "Custom color" })}
					className={cn(
						"relative flex size-7 cursor-pointer items-center justify-center rounded-full border-2 transition-transform hover:scale-110",
						"focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
						disabled && "cursor-not-allowed opacity-50 hover:scale-100",
						customColor ? "scale-110 border-foreground" : "border-transparent",
					)}
				>
					<span
						className="size-5 rounded-full border border-border/50"
						style={{ background: customColor ?? CUSTOM_SWATCH_BACKGROUND }}
					/>
					<CustomColorInput
						value={customColor ?? "#64748b"}
						disabled={disabled}
						onCommit={onSelectColor}
						aria-label={t({ message: "Custom color" })}
						className="absolute inset-0 size-full cursor-pointer opacity-0"
					/>
				</div>
			) : null}
		</div>
	);
}
