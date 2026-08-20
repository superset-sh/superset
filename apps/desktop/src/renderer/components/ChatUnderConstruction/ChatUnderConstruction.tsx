import { Construction } from "lucide-react";

export function ChatUnderConstruction() {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
			<Construction className="size-8 text-muted-foreground" />
			<div className="space-y-1">
				<p className="font-medium text-sm">Chat is being reworked</p>
				<p className="text-muted-foreground text-xs">
					We're rebuilding this feature. Check back soon.
				</p>
			</div>
		</div>
	);
}
