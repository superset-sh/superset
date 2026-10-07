import { Trans } from "@lingui/react/macro";
import Link from "next/link";

const buttonClassName =
	"px-4 py-3 font-mono text-xs tracking-wider uppercase transition-colors";

export function CareersCTA() {
	return (
		<section className="border-border border-t py-24 text-center sm:py-32">
			<h2 className="mb-4 text-3xl leading-[1.1] font-medium tracking-tight text-foreground sm:text-4xl">
				<Trans>Come build it with us.</Trans>
			</h2>
			<p className="mx-auto mb-8 max-w-[34rem] text-muted-foreground">
				<Trans>See the open roles, or try Superset first.</Trans>
			</p>
			<div className="flex flex-wrap justify-center gap-3">
				<Link
					href="#open-roles"
					className={`${buttonClassName} bg-foreground text-background hover:bg-brand hover:text-white`}
				>
					<Trans>See open roles ↑</Trans>
				</Link>
				<Link
					href="/download"
					className={`${buttonClassName} border border-border text-foreground hover:bg-muted`}
				>
					<Trans>Download Superset</Trans>
				</Link>
			</div>
		</section>
	);
}
