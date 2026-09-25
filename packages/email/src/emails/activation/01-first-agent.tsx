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
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-3">
				Your first agent, safely
			</Heading>
			<Text className="text-[15px] leading-6 text-muted m-0 mb-6">
				The part most people don&apos;t realize: the agent never touches your
				working tree.
			</Text>

			<Section className="bg-surface border border-solid border-border rounded-lg p-5 mb-6">
				<Text className="text-[15px] leading-6 text-foreground m-0 mb-3">
					<strong>Every workspace is an isolated copy of your repo</strong> on
					its own branch. Your checkout, your uncommitted changes, your local
					state all stay untouched.
				</Text>
				<Text className="text-[15px] leading-6 text-foreground m-0">
					If the result is garbage, delete the workspace. Nothing happened.
				</Text>
			</Section>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				And it&apos;s all local. Your code never leaves your machine unless you
				say so.
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				So take the first swing on something small: a flaky test, or the rename
				you&apos;ve been putting off. Something you were going to do anyway this
				week.
			</Text>

			<Section>
				<Button href={`https://superset.sh/download${utm}`}>
					Get the desktop app
				</Button>
			</Section>
		</EmailLayout>
	);
}

export default ActivationNudge1;
