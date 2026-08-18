import { Heading, Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../../components";

const utm =
	"?utm_source=email&utm_medium=lifecycle&utm_campaign=activation&utm_content=d1-first-workspace";

interface ActivationNudge1Props {
	userEmail?: string;
	unsubscribeUrl?: string;
}

export function ActivationNudge1({
	userEmail,
	unsubscribeUrl,
}: ActivationNudge1Props = {}) {
	return (
		<EmailLayout
			preview="The agent never touches your working tree."
			recipientEmail={userEmail}
			unsubscribeUrl={unsubscribeUrl}
		>
			<Heading className="text-[28px] font-semibold leading-9 text-foreground text-center mt-2 mb-2">
				Your first agent, safely
			</Heading>
			<Text className="text-base leading-6 text-muted text-center m-0 mb-8">
				The part most people don&apos;t realize: the agent never touches your
				working tree.
			</Text>

			<Section className="bg-surface border border-solid border-border rounded-2xl p-6 mb-8">
				<Text className="text-base leading-[26px] text-foreground m-0 mb-3">
					<strong>Every workspace is an isolated copy of your repo</strong> on
					its own branch. Your checkout, your uncommitted changes, your local
					state — untouched.
				</Text>
				<Text className="text-base leading-[26px] text-foreground m-0">
					If the result is garbage, delete the workspace.
					<br />
					Nothing happened.
				</Text>
			</Section>

			<Text className="text-base leading-6 text-foreground m-0 mb-2 font-semibold">
				So take the first swing on something small:
			</Text>
			<Text className="text-base leading-[26px] text-foreground m-0 mb-8">
				A flaky test. A TODO. The rename you&apos;ve been putting off. Something
				you were going to do anyway this week.
			</Text>

			<Section className="text-center mb-2">
				<Button href={`https://superset.sh/download${utm}`}>
					Get the desktop app
				</Button>
			</Section>
		</EmailLayout>
	);
}

export default ActivationNudge1;
