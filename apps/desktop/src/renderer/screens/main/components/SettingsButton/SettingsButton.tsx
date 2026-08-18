import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { LuSettings } from "react-icons/lu";
import { HotkeyLabel } from "renderer/hotkeys";

interface SettingsButtonProps {
	side?: ComponentProps<typeof TooltipContent>["side"];
	className?: string;
	iconClassName?: string;
	iconStrokeWidth?: number;
}

export function SettingsButton({
	side = "bottom",
	className,
	iconClassName,
	iconStrokeWidth = 2,
}: SettingsButtonProps) {
	const navigate = useNavigate();

	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => navigate({ to: "/settings/account" })}
					aria-label="Open settings"
					className={cn("no-drag", className)}
				>
					<LuSettings
						className={cn("size-5", iconClassName)}
						strokeWidth={iconStrokeWidth}
					/>
				</Button>
			</TooltipTrigger>
			<TooltipContent side={side}>
				<HotkeyLabel fallbackLabel="Open settings" id="OPEN_SETTINGS" />
			</TooltipContent>
		</Tooltip>
	);
}
