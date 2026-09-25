import { Trans } from "@lingui/react/macro";
import { SectionHeading } from "../SectionHeading";

export function AboutSection() {
	return (
		<section aria-labelledby="about">
			<SectionHeading id="about">
				<Trans>About Superset</Trans>
			</SectionHeading>
			<p className="mt-6 text-foreground text-lg leading-relaxed">
				<Trans>
					Superset (YC S26) is the open-source IDE for the AI agents era, where
					engineers run hundreds of coding agents like Claude Code and Codex in
					parallel. In under a year, more than 130,000 developers across 176
					countries have run Superset and created over 1.5 million agent
					workspaces. Japan is its second-largest market after the US, with over
					12,000 developers adopting it before it was even available in
					Japanese, and Asia as a whole now accounts for more users than the US.
					Superset is used by engineers at Netflix, Microsoft, NVIDIA, DoorDash,
					Wix, and Mistral AI globally, and across Asia at ByteDance, Toss,
					Kakao, Grab, LINE, and Rakuten. It has 14k+ GitHub stars, hit #1 on
					Product Hunt, and recently launched full Japanese language support.
				</Trans>
			</p>
			<p className="mt-6 text-foreground text-lg leading-relaxed">
				<Trans>
					Superset has now hired its first founding engineer, Harshith
					Mullapudi, a YC S23 founder who built two open-source AI products,
					Tegon and CORE (4k GitHub stars combined), after engineering roles at
					Airbyte and HackerRank. At CORE he had independently built remote
					orchestration for Claude Code and Codex, and he is joining Superset to
					build the platform where teams run software factories that
					autonomously ship code.
				</Trans>
			</p>
		</section>
	);
}
