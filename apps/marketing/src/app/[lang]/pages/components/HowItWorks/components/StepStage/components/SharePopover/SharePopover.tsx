import { Trans } from "@lingui/react/macro";
import { Building2, Check, Globe, Link2, Lock } from "lucide-react";

export function SharePopover() {
	return (
		<div className="absolute top-16 right-4 w-72 overflow-hidden rounded-md border border-border bg-popover text-sm shadow-xl sm:top-20 sm:right-8">
			<div className="flex items-center justify-between px-3 py-2.5">
				<span className="font-medium">
					<Trans>Share page</Trans>
				</span>
				<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<Link2 className="size-3.5" />
					<Trans>Copy link</Trans>
				</span>
			</div>
			<div className="space-y-0.5 border-border border-t px-3 py-2.5 text-xs">
				<p className="mb-2 font-medium">
					<Trans>People with access</Trans>
				</p>
				<p className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
					<Lock className="size-3.5" />
					<Trans>Only you</Trans>
				</p>
				<p className="flex items-center gap-2 rounded-sm bg-accent px-2 py-1.5 text-foreground">
					<Building2 className="size-3.5" />
					<span className="flex-1">
						<Trans>Anyone in your organization</Trans>
					</span>
					<Check className="size-3.5" />
				</p>
				<p className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
					<Globe className="size-3.5" />
					<Trans>Anyone with the link</Trans>
				</p>
			</div>
		</div>
	);
}
