import { Trans } from "@lingui/react/macro";
import Link from "next/link";

interface ViewToggleProps {
	handle: string;
}

export function ViewToggle({ handle }: ViewToggleProps) {
	return (
		<div className="inline-flex items-stretch border border-border rounded-[2px] text-sm">
			<span className="inline-flex min-h-11 items-center px-3 py-2 bg-foreground/[0.06] text-foreground">
				<Trans>Human</Trans>
			</span>
			<Link
				href={`/md/user/${handle}`}
				prefetch={false}
				className="inline-flex min-h-11 items-center px-3 py-2 text-muted-foreground hover:text-brand transition-colors border-l border-border"
			>
				<Trans>Agent</Trans>
			</Link>
		</div>
	);
}
