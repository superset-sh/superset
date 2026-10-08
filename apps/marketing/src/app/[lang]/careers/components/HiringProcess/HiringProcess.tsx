import { Trans } from "@lingui/react/macro";

export function HiringProcess({ className = "" }: { className?: string }) {
	const steps = [
		{
			id: "intro-call",
			duration: <Trans>15 min</Trans>,
			title: <Trans>Intro call</Trans>,
			detail: <Trans>Bring a link to something you built recently.</Trans>,
		},
		{
			id: "technical",
			duration: <Trans>1 hr</Trans>,
			title: <Trans>Technical interview</Trans>,
			detail: (
				<Trans>
					A practical TypeScript problem, like the ones we solve every day. No
					algorithm puzzles.
				</Trans>
			),
		},
		{
			id: "system-design",
			duration: <Trans>1 hr</Trans>,
			title: <Trans>System design</Trans>,
			detail: <Trans>Design a complex system on a whiteboard.</Trans>,
		},
		{
			id: "work-trial",
			duration: <Trans>5 days</Trans>,
			title: <Trans>Paid work trial</Trans>,
			detail: (
				<Trans>
					Spend 5 days in San Francisco building with us as part of the team.
				</Trans>
			),
		},
	];

	return (
		<section className={className}>
			<h2 className="mb-2 text-[22px] leading-7 font-[450] tracking-[-0.025em] text-foreground sm:text-2xl sm:leading-8">
				<Trans>How we hire</Trans>
			</h2>
			<p className="mb-8 max-w-[40rem] text-base leading-[1.65] text-muted-foreground">
				<Trans>
					About three weeks from first call to offer, ending with a paid work
					trial. Every step is with a founder, and you hear back within 48
					hours.
				</Trans>
			</p>
			<ol className="m-0 grid list-none grid-cols-1 p-0 sm:grid-cols-2 lg:grid-cols-4">
				{steps.map((step, index) => (
					<li
						key={step.id}
						className="border-border border-t py-6 sm:pr-6 lg:[&+&]:border-l lg:[&+&]:pl-6"
					>
						<div className="mb-3 flex items-baseline justify-between font-mono text-[11px] tracking-[0.07em] uppercase">
							<span className="text-brand-light">
								{String(index + 1).padStart(2, "0")}
							</span>
							<span className="text-muted-foreground">{step.duration}</span>
						</div>
						<p className="m-0 mb-2 text-[17px] leading-6 font-[450] tracking-[-0.015em] text-foreground">
							{step.title}
						</p>
						<p className="m-0 text-[15px] leading-[1.6] text-muted-foreground">
							{step.detail}
						</p>
					</li>
				))}
			</ol>
		</section>
	);
}
