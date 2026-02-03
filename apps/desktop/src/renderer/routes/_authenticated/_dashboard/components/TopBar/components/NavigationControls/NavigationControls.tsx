import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useLocation, useRouter } from "@tanstack/react-router";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { HistoryDropdown } from "./components/HistoryDropdown";

export function NavigationControls() {
	const router = useRouter();
	const location = useLocation();

	const canGoBack = router.history.canGoBack();
	const canGoForward = location.state.__TSR_index < router.history.length - 1;

	useAppHotkey("NAVIGATE_BACK", () => router.history.back());
	useAppHotkey("NAVIGATE_FORWARD", () => router.history.forward());

	return (
		<div className="flex items-center">
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => router.history.back()}
						disabled={!canGoBack}
						className="no-drag flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
					>
						<LuArrowLeft className="size-4" strokeWidth={1.5} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<HotkeyTooltipContent label="Go back" hotkeyId="NAVIGATE_BACK" />
				</TooltipContent>
			</Tooltip>

			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => router.history.forward()}
						disabled={!canGoForward}
						className="no-drag flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
					>
						<LuArrowRight className="size-4" strokeWidth={1.5} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<HotkeyTooltipContent
						label="Go forward"
						hotkeyId="NAVIGATE_FORWARD"
					/>
				</TooltipContent>
			</Tooltip>

			<HistoryDropdown />
		</div>
	);
}
