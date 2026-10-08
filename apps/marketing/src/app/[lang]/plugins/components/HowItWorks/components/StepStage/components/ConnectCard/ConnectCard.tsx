import { Trans } from "@lingui/react/macro";
import { Check } from "lucide-react";
import { PluginIcon } from "../../../../../PluginIcon";

export function ConnectCard() {
	return (
		<div className="absolute right-4 bottom-4 left-4 rounded-[13px] border border-border bg-popover p-4 shadow-xl sm:left-auto sm:w-80">
			<div className="flex items-center gap-3">
				<PluginIcon name="linear" size="sm" />
				<p className="font-medium text-foreground text-sm">
					<Trans>Connect Linear</Trans>
				</p>
			</div>
			<p className="mt-3 text-muted-foreground text-xs leading-relaxed">
				<Trans>Agents use this account when they call Linear tools.</Trans>
			</p>
			<div className="mt-3 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
				<span className="text-foreground">maya@acme.com</span>
				<span className="ml-auto flex items-center gap-1 text-emerald-500">
					<Check className="size-3.5" />
					<Trans>Connected</Trans>
				</span>
			</div>
		</div>
	);
}
