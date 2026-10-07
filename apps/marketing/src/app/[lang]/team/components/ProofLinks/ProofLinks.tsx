import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

const linkClassName =
	"group flex flex-col gap-2 border border-border p-5 hover:bg-muted/50 hover:border-foreground/20 transition-colors";
const titleClassName =
	"inline-flex items-center gap-1 text-foreground font-medium";
const arrowClassName =
	"size-4 text-muted-foreground group-hover:text-foreground transition-colors";

export function ProofLinks() {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<Link href="/changelog" className={linkClassName}>
				<span className={titleClassName}>
					<Trans>Changelog</Trans>
					<ArrowUpRight className={arrowClassName} />
				</span>
				<span className="text-sm text-muted-foreground">
					<Trans>What we ship, every week.</Trans>
				</span>
			</Link>
			<Link href="/blog" className={linkClassName}>
				<span className={titleClassName}>
					<Trans>Blog</Trans>
					<ArrowUpRight className={arrowClassName} />
				</span>
				<span className="text-sm text-muted-foreground">
					<Trans>How we build it, in long form.</Trans>
				</span>
			</Link>
			<a
				href={COMPANY.GITHUB_URL}
				target="_blank"
				rel="noopener noreferrer"
				className={linkClassName}
			>
				<span className={titleClassName}>
					GitHub
					<ArrowUpRight className={arrowClassName} />
				</span>
				<span className="text-sm text-muted-foreground">
					<Trans>Read the source and every pull request.</Trans>
				</span>
			</a>
		</div>
	);
}
