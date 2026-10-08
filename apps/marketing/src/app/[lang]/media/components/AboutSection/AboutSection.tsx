import { Trans } from "@lingui/react/macro";
import { SectionHeading } from "../SectionHeading";

export function AboutSection() {
	return (
		<section aria-labelledby="about">
			<SectionHeading id="about">
				<Trans>About Superset</Trans>
			</SectionHeading>
			<div className="mt-6 space-y-5 text-foreground text-lg leading-relaxed">
				<p>
					<Trans>
						Superset (YC S26) is the open-source IDE for the AI agents era,
						where engineers run hundreds of coding agents like Claude Code and
						Codex in parallel.
					</Trans>
				</p>
				<p>
					<Trans>
						In under a year, more than 130,000 developers across 176 countries
						have run Superset and created over 1.5 million agent workspaces.
						Japan is its second-largest market after the US, with over 12,000
						developers, and Asia as a whole now accounts for more users than the
						US.
					</Trans>
				</p>
				<p>
					<Trans>
						Superset is used by engineers at Netflix, Microsoft, NVIDIA,
						DoorDash, Wix, and Mistral AI globally, and across Asia at
						ByteDance, Toss, Kakao, Grab, LINE, and Rakuten.
					</Trans>
				</p>
				<p>
					<Trans>
						Superset raised an $11.5M seed round led by Union Square Ventures,
						with Y Combinator and Paul Graham. TechCrunch named it one of the
						standout startups from YC Demo Day.
					</Trans>
				</p>
				<p>
					<Trans>
						On GitHub, it has 15k+ stars, 1,000+ forks, and 100+ contributors.
						It also hit #1 on Product Hunt.
					</Trans>
				</p>
			</div>
		</section>
	);
}
