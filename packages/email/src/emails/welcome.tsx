import { Section, Text } from "@react-email/components";
import {
	BandSection,
	DisplayHeading,
	HeroCard,
	IdeaBlock,
	LifecycleLayout,
	PillButton,
} from "../components/lifecycle";
import { env } from "../lib/env";
import { lifecycle } from "../lib/lifecycle-theme";

const utm = (content: string) =>
	`?utm_source=email&utm_medium=lifecycle&utm_campaign=welcome&utm_content=${content}`;

const DOWNLOAD = "https://superset.sh/download";

const body = {
	margin: "0 0 20px 0",
	fontFamily: lifecycle.fonts.sans,
	fontSize: "16px",
	lineHeight: "24px",
	color: lifecycle.colors.ink,
} as const;

interface WelcomeEmailProps {
	userName?: string;
	userEmail?: string;
}

export function WelcomeEmail({ userEmail }: WelcomeEmailProps = {}) {
	const assets = `${env.NEXT_PUBLIC_MARKETING_URL}/assets/emails`;

	return (
		<LifecycleLayout
			preview="Your command center for coding agents — let's get you set up."
			recipientEmail={userEmail}
		>
			<BandSection tone="paper">
				<DisplayHeading size="lg">
					Welcome to Superset,
					<br />
					your agent command center
				</DisplayHeading>

				<HeroCard
					src={`${assets}/welcome-hero.png`}
					alt="Superset running coding agents across parallel workspaces"
					href={`${DOWNLOAD}${utm("hero-image")}`}
				/>

				<Text style={body}>
					Welcome to Superset, your agent command center — ready to take on real
					work from your backlog.
				</Text>

				<Text style={{ ...body, fontWeight: 700 }}>
					Imagine shipping with a team of agents that:
				</Text>

				<ul style={{ margin: "0 0 20px 0", paddingLeft: "24px" }}>
					<li style={{ ...body, margin: "0 0 8px 0" }}>
						Works in parallel, each in its own isolated workspace
					</li>
					<li style={{ ...body, margin: "0 0 8px 0" }}>
						Keeps every change on its own branch, ready to review
					</li>
					<li style={{ ...body, margin: 0 }}>
						Picks up tasks and runs while you focus elsewhere
					</li>
				</ul>

				<Text style={{ ...body, margin: "0 0 28px 0" }}>
					That&rsquo;s Superset.
				</Text>

				<PillButton href={`${DOWNLOAD}${utm("hero-cta")}`}>
					Get the desktop app
				</PillButton>
			</BandSection>

			<BandSection>
				<DisplayHeading size="md">Point agents at real work</DisplayHeading>

				<Text style={{ ...body, textAlign: "center" }}>
					The easiest way to get started is to hand an agent one thing you were
					already going to do this week.
				</Text>

				<Text
					style={{
						...body,
						fontWeight: 700,
						textAlign: "center",
						margin: "0 0 36px 0",
					}}
				>
					Here are a few simple ideas:
				</Text>

				<IdeaBlock
					doodleSrc={`${assets}/doodle-terminal.png`}
					title="Clear a bug from your backlog"
					quote="Take that flaky test and fix it in an isolated workspace."
					linkLabel="Download Superset"
					href={`${DOWNLOAD}${utm("idea-bug")}`}
				/>

				<IdeaBlock
					doodleSrc={`${assets}/doodle-branch.png`}
					title="Run two agents side by side"
					quote="Have Claude Code refactor the API while Codex writes the tests."
					linkLabel="See supported agents"
					href={`https://docs.superset.sh/providers${utm("idea-agents")}`}
				/>

				<IdeaBlock
					doodleSrc={`${assets}/doodle-tasks.png`}
					title="Turn your TODO list into tasks"
					quote="Plan the work as tasks, dispatch an agent to each, review the diffs."
					linkLabel="See how tasks work"
					href={`https://docs.superset.sh${utm("idea-tasks")}`}
				/>

				<PillButton href={`${DOWNLOAD}${utm("mid-cta")}`}>
					Get the desktop app
				</PillButton>
			</BandSection>

			<BandSection tone="paper">
				<Section style={{ padding: "0 0 8px 0" }}>
					<DisplayHeading size="sm" align="left">
						Why Superset is different
					</DisplayHeading>
					<Text style={{ ...body, margin: "-8px 0 36px 0" }}>
						Agents are only useful when they can work like teammates. Superset
						gives every agent an isolated copy of your repo on its own branch —
						so agents work in parallel, never step on each other, and every
						change comes back as a reviewable diff.
					</Text>

					<DisplayHeading size="sm" align="left">
						Questions?
					</DisplayHeading>
					<Text style={{ ...body, margin: "-8px 0 0 0" }}>
						Just reply to this email — a founder reads every message.
					</Text>
				</Section>
			</BandSection>
		</LifecycleLayout>
	);
}

export default WelcomeEmail;
