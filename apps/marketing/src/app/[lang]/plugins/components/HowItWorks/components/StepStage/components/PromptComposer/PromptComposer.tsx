import { Trans } from "@lingui/react/macro";
import { ArrowUp } from "lucide-react";
import { PluginIcon } from "../../../../../PluginIcon";

export function PromptComposer() {
	return (
		<div className="absolute right-4 bottom-4 left-4 rounded-[13px] border border-border bg-popover p-3 shadow-xl sm:right-auto sm:left-6 sm:w-96">
			<p className="text-foreground text-sm leading-relaxed">
				<span className="mr-1 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 align-middle text-xs">
					<PluginIcon name="linear" size="sm" />
					Linear
				</span>
				<Trans>file a bug for the Safari login crash</Trans>
			</p>
			<div className="mt-3 flex items-center justify-between">
				<span className="text-[10px] text-muted-foreground">claude</span>
				<span className="flex size-6 items-center justify-center rounded-full bg-foreground text-background">
					<ArrowUp className="size-3.5" />
				</span>
			</div>
		</div>
	);
}
