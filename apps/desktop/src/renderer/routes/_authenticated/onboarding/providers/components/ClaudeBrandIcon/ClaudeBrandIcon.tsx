import { cn } from "@superset/ui/utils";
import { ClaudeLogo } from "../ClaudeLogo";

interface ClaudeBrandIconProps {
	className?: string;
	iconClassName?: string;
}

export function ClaudeBrandIcon({
	className,
	iconClassName,
}: ClaudeBrandIconProps) {
	return (
		<div
			className={cn("flex items-center justify-center bg-[#D97757]", className)}
		>
			<ClaudeLogo className={cn("text-white", iconClassName)} />
		</div>
	);
}
