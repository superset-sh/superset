import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuMenu } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Opens the application menu on Windows and Linux, where the hidden title
 * bar takes the menu bar with it; macOS has its own menu bar.
 */
export function AppMenuButton() {
	const { t } = useLingui();
	const popup = electronTrpc.window.popupApplicationMenu.useMutation();
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => popup.mutate()}
					aria-label={t({ message: "Application menu" })}
					className="no-drag flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover"
				>
					<LuMenu className="size-4" strokeWidth={1.5} />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<span>{t({ message: "Application menu" })}</span>
			</TooltipContent>
		</Tooltip>
	);
}
