import { Trans } from "@lingui/react/macro";
import Link from "next/link";

interface ViewToggleProps {
	handle: string;
}

export function ViewToggle({ handle }: ViewToggleProps) {
	return (
		<div className="inline-flex items-stretch border border-border font-mono text-[0.6rem] uppercase tracking-[0.12em]">
			<span className="px-2.5 py-1 bg-foreground/[0.06] text-foreground">
				<Trans>Human</Trans>
			</span>
			<Link
				href={`/md/user/${handle}`}
				prefetch={false}
				className="px-2.5 py-1 text-muted-foreground hover:text-brand transition-colors border-l border-border"
			>
				<Trans>Agent</Trans>
			</Link>
		</div>
	);
}
