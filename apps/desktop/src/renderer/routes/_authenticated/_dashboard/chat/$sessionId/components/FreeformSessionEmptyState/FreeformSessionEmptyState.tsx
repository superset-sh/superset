import { Button } from "@superset/ui/button";
import { MessageSquare, SquareTerminal } from "lucide-react";

export function FreeformSessionEmptyState({
	onOpenChat,
	onOpenTerminal,
}: {
	onOpenChat: () => void;
	onOpenTerminal: () => void;
}) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
			<div className="flex flex-col gap-1">
				<h2 className="text-base font-medium">Freeform session</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					A chat or terminal that isn't tied to a project. Runs in your home
					directory.
				</p>
			</div>
			<div className="flex flex-wrap justify-center gap-2">
				<Button variant="outline" className="gap-2" onClick={onOpenChat}>
					<MessageSquare className="size-4" />
					New chat
				</Button>
				<Button variant="outline" className="gap-2" onClick={onOpenTerminal}>
					<SquareTerminal className="size-4" />
					New terminal
				</Button>
			</div>
		</div>
	);
}
