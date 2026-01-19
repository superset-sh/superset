import { Button } from "@superset/ui/button";
import { Card } from "@superset/ui/card";
import { HiExclamationTriangle } from "react-icons/hi2";
import { LuPower, LuTerminal } from "react-icons/lu";

interface OverlayContainerProps {
	children: React.ReactNode;
}

/**
 * Common overlay container with centered positioning and backdrop.
 */
function OverlayContainer({ children }: OverlayContainerProps) {
	return (
		<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
			{children}
		</div>
	);
}

interface KilledOverlayProps {
	onRestart: () => void;
}

/**
 * Overlay shown when terminal session was killed by user.
 */
export function KilledOverlay({ onRestart }: KilledOverlayProps) {
	return (
		<OverlayContainer>
			<Card className="gap-3 py-4 px-2">
				<div className="flex flex-col items-center text-center gap-1.5 px-4">
					<LuPower className="size-5 text-muted-foreground" />
					<div className="space-y-0.5">
						<p className="text-sm font-medium">Session killed</p>
						<p className="text-xs text-muted-foreground">
							You terminated this shell session
						</p>
					</div>
				</div>
				<div className="px-4">
					<Button size="sm" className="w-full" onClick={onRestart}>
						Restart
					</Button>
				</div>
			</Card>
		</OverlayContainer>
	);
}

interface ConnectionErrorOverlayProps {
	onRetry: () => void;
}

/**
 * Overlay shown when connection to terminal daemon is lost.
 */
export function ConnectionErrorOverlay({
	onRetry,
}: ConnectionErrorOverlayProps) {
	return (
		<OverlayContainer>
			<Card className="gap-3 py-4 px-2 max-w-xs">
				<div className="flex flex-col items-center text-center gap-1.5 px-4">
					<HiExclamationTriangle className="size-5 text-destructive" />
					<div className="space-y-0.5">
						<p className="text-sm font-medium">Connection error</p>
						<p className="text-xs text-muted-foreground">
							Lost connection to terminal daemon
						</p>
					</div>
				</div>
				<div className="px-4">
					<Button size="sm" className="w-full" onClick={onRetry}>
						Retry
					</Button>
				</div>
			</Card>
		</OverlayContainer>
	);
}

interface RestoredOverlayProps {
	onStartShell: () => void;
}

/**
 * Overlay shown after cold restore (reboot recovery).
 * Previous scrollback is preserved and displayed read-only until user starts new shell.
 */
export function RestoredOverlay({ onStartShell }: RestoredOverlayProps) {
	return (
		<OverlayContainer>
			<Card className="gap-3 py-4 px-2">
				<div className="flex flex-col items-center text-center gap-1.5 px-4">
					<LuTerminal className="size-5 text-primary" />
					<div className="space-y-0.5">
						<p className="text-sm font-medium">Session restored</p>
						<p className="text-xs text-muted-foreground">
							Previous scrollback preserved after restart
						</p>
					</div>
				</div>
				<div className="px-4">
					<Button size="sm" className="w-full" onClick={onStartShell}>
						Start Shell
					</Button>
				</div>
			</Card>
		</OverlayContainer>
	);
}
