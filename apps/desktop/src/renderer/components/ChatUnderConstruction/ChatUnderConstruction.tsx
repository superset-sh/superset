import { Trans } from "@lingui/react/macro";
import { Construction } from "lucide-react";

export function ChatUnderConstruction() {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
			<Construction className="size-8 text-muted-foreground" />
			<div className="space-y-1">
				<p className="font-medium text-sm">
					<Trans id="components.chatUnderConstruction.title">
						Chat is being reworked
					</Trans>
				</p>
				<p className="text-muted-foreground text-xs">
					<Trans id="components.chatUnderConstruction.description">
						We're rebuilding this feature. Check back soon.
					</Trans>
				</p>
			</div>
		</div>
	);
}
