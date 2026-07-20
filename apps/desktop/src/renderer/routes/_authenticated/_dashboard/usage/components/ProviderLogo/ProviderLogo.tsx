import { cn } from "@superset/ui/utils";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";

interface ProviderLogoProps {
	/** Preset-icon key, e.g. "claude", "codex", "cursor-agent". */
	id: string;
	className?: string;
}

export function ProviderLogo({ id, className }: ProviderLogoProps) {
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(id, isDark);
	if (!icon) return null;
	return (
		<img
			src={icon}
			alt=""
			aria-hidden
			className={cn("shrink-0 object-contain", className)}
		/>
	);
}
