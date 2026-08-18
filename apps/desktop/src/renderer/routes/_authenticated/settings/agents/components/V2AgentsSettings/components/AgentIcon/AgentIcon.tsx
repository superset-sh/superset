import { cn } from "@superset/ui/utils";
import { Bot } from "lucide-react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";

interface AgentIconProps {
	/**
	 * Explicit icon override: a built-in icon key or an uploaded `data:` image
	 * URI. Falls back to the icon implied by `presetId`.
	 */
	iconId?: string | null;
	presetId: string;
	/** Sizing/color classes applied to both the image and the fallback glyph. */
	className?: string;
}

/**
 * Renders a host-agent's icon: the `iconId` override when set, otherwise the
 * icon implied by `presetId`, otherwise a neutral fallback glyph so custom
 * agents without a recognizable icon still look intentional.
 */
export function AgentIcon({ iconId, presetId, className }: AgentIconProps) {
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(iconId ?? presetId, isDark);
	if (icon) {
		return (
			<img
				src={icon}
				alt=""
				className={cn("object-contain shrink-0", className)}
			/>
		);
	}
	return (
		<Bot
			aria-hidden="true"
			className={cn("shrink-0 text-muted-foreground", className)}
		/>
	);
}
