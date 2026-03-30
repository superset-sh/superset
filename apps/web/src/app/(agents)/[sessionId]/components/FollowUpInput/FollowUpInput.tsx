"use client";

import { PreviewPromptComposer } from "../../../components/PreviewPromptComposer";

export function FollowUpInput() {
	return (
		<PreviewPromptComposer
			containerClassName="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/60"
			promptInputClassName="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
			placeholder="Follow-ups on web are coming soon"
			footerTools={
				<span className="text-xs text-muted-foreground">Claude Sonnet 4.5</span>
			}
			messageClassName="pt-2 text-xs text-muted-foreground"
		/>
	);
}
