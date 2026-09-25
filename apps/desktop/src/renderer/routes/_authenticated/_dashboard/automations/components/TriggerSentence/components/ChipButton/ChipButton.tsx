import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuChevronDown } from "react-icons/lu";
import { CHIP, CHIP_EMPTY } from "../../chipStyles";

export function ChipButton({
	label,
	icon,
	empty,
	disabled,
	className,
}: {
	label: string;
	icon?: ReactNode;
	empty?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			className={cn(CHIP, empty && CHIP_EMPTY, className)}
		>
			{icon}
			<span className="truncate">{label}</span>
			<LuChevronDown className="size-3 shrink-0 opacity-50" />
		</button>
	);
}
