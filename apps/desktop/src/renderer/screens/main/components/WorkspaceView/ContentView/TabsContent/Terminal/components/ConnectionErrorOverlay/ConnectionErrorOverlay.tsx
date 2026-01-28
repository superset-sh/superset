import { Button } from "@superset/ui/button";
import { Card } from "@superset/ui/card";
import { HiExclamationTriangle } from "react-icons/hi2";

interface ConnectionErrorOverlayProps {
	onRetry: () => void;
}

export function ConnectionErrorOverlay({
	onRetry,
}: ConnectionErrorOverlayProps) {
	return (
		<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
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
		</div>
	);
}
