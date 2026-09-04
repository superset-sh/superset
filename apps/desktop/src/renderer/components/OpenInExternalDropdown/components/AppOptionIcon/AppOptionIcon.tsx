import { cn } from "@superset/ui/utils";
import { LuAppWindow } from "react-icons/lu";
import type { OpenInExternalAppOption } from "../../constants";

interface AppOptionIconProps {
	option: OpenInExternalAppOption;
	isDark: boolean;
	className?: string;
}

/**
 * Icon for an "Open in" option. Built-in apps ship a bundled asset;
 * user-defined apps have none and fall back to a generic window glyph.
 */
export function AppOptionIcon({
	option,
	isDark,
	className,
}: AppOptionIconProps) {
	const icon = isDark ? option.darkIcon : option.lightIcon;
	if (!icon) {
		return <LuAppWindow className={cn("size-4 shrink-0", className)} />;
	}
	return (
		<img
			src={icon}
			alt=""
			className={cn("size-4 shrink-0 object-contain", className)}
		/>
	);
}
