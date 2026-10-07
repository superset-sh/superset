import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import Link from "next/link";
import { Principle } from "./components/Principle";

const linkClassName =
	"mt-4 inline-block font-mono text-[11px] leading-4 tracking-[0.07em] text-muted-foreground uppercase transition-colors hover:text-brand-light";

export function HowWeWork({ className = "" }: { className?: string }) {
	return (
		<section className={className}>
			<h2 className="mb-2 text-[22px] leading-7 font-[450] tracking-[-0.025em] text-foreground sm:text-2xl sm:leading-8">
				<Trans>How we work</Trans>
			</h2>
			<p className="mb-8 text-base leading-[1.65] text-muted-foreground">
				<Trans>You can see how we work before you talk to us.</Trans>
			</p>
			<div className="grid grid-cols-1 sm:grid-cols-3 sm:border-border sm:border-t">
				<Principle number="01" title={<Trans>Built in Superset</Trans>}>
					<Trans>
						Superset is built in Superset, so we're our own #1 users. You get
						paid to make your own life easier.
					</Trans>
				</Principle>
				<Principle
					number="02"
					title={<Trans>Ship every week</Trans>}
					link={
						<Link href="/changelog" className={linkClassName}>
							<Trans>Read the changelog ↗</Trans>
						</Link>
					}
				>
					<Trans>
						A changelog goes out every week. Most new hires ship to users in
						their first few days.
					</Trans>
				</Principle>
				<Principle
					number="03"
					title={<Trans>Build in public</Trans>}
					link={
						<a
							href={COMPANY.GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
							className={linkClassName}
						>
							<Trans>Browse the repo ↗</Trans>
						</a>
					}
				>
					<Trans>
						Superset is source-available. Every pull request, review and bug is
						public on GitHub.
					</Trans>
				</Principle>
			</div>
		</section>
	);
}
