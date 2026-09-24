import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import Link from "next/link";
import { initServerI18n } from "@/app/i18n-server";
import { WORKFLOWS } from "./constants";

export async function WorkflowSection() {
	const locale = await initServerI18n();
	const i18n = getI18nInstance(locale);
	return (
		<section
			id="workflows"
			aria-labelledby="workflows-heading"
			className="border-y border-border py-20 sm:py-24"
		>
			<div className="mx-auto max-w-7xl px-6 sm:px-8">
				<h2
					id="workflows-heading"
					className="max-w-2xl text-3xl font-medium tracking-tight sm:text-4xl"
				>
					<Trans>Give your coding agent feedback where you work</Trans>
				</h2>
				<div className="mt-10 grid gap-6 lg:grid-cols-3">
					{WORKFLOWS.map((workflow) => (
						<article
							key={workflow.id}
							className="flex flex-col border border-border bg-card p-7 sm:p-8"
						>
							<h3 className="text-xl font-medium tracking-tight">
								{i18n._(workflow.title)}
							</h3>
							<p className="mt-4 mb-8 text-base leading-relaxed text-muted-foreground">
								{i18n._(workflow.description)}
							</p>
							<Link
								href={workflow.href}
								className="mt-auto w-fit text-sm text-brand underline underline-offset-4 hover:text-foreground"
							>
								{i18n._(workflow.action)}
							</Link>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}
