import { Heading, Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../components";

const utm =
	"?utm_source=email&utm_medium=lifecycle&utm_campaign=activation&utm_content=d3-ideas";

const ideas = [
	{
		title: "The bug you keep re-opening",
		text: "Paste the issue and let the agent reproduce and fix it in its own workspace.",
	},
	{
		title: "Tests for that one module",
		text: "The coverage you keep meaning to write. Agents are extremely patient.",
	},
	{
		title: "Two agents at once",
		text: "Claude Code refactors while Codex writes the tests — separate workspaces, no collisions.",
	},
] as const;

interface ActivationNudge2Props {
	userEmail?: string;
	unsubscribeUrl?: string;
}

export function ActivationNudge2({
	userEmail,
	unsubscribeUrl,
}: ActivationNudge2Props = {}) {
	return (
		<EmailLayout
			preview="The hardest part is the first prompt."
			recipientEmail={userEmail}
			unsubscribeUrl={unsubscribeUrl}
		>
			<Heading className="text-[28px] font-semibold leading-9 text-foreground text-center mt-2 mb-2">
				What people actually hand their agents
			</Heading>
			<Text className="text-base leading-6 text-muted text-center m-0 mb-8">
				The hardest part of agent tools is the first prompt. Steal one of these.
			</Text>

			{ideas.map((idea) => (
				<Section
					key={idea.title}
					className="bg-surface border border-solid border-border rounded-2xl p-5 mb-4"
				>
					<Text className="text-base leading-6 text-foreground font-semibold m-0 mb-1">
						{idea.title}
					</Text>
					<Text className="text-base leading-6 text-muted m-0">
						{idea.text}
					</Text>
				</Section>
			))}

			<Text className="text-base leading-6 text-foreground text-center m-0 mt-8 mb-8">
				You stay the reviewer — everything comes back as a diff.
			</Text>

			<Section className="text-center mb-2">
				<Button href={`https://superset.sh/download${utm}`}>
					Get the desktop app
				</Button>
			</Section>
		</EmailLayout>
	);
}

export default ActivationNudge2;
