import { Heading, Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../../components";

// Week-2 habit email in the post-activation automation: the most
// differentiated retention hook, scheduled agents that produce a reviewable
// workspace while you're away.

interface ActivationNudge3AutomationsProps {
	userEmail?: string;
	unsubscribeUrl?: string;
}

export function ActivationNudge3Automations({
	userEmail,
	unsubscribeUrl,
}: ActivationNudge3AutomationsProps = {}) {
	return (
		<EmailLayout
			preview="Wake up to a reviewable workspace."
			recipientEmail={userEmail}
			unsubscribeUrl={unsubscribeUrl}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-3">
				Put a chore on a schedule
			</Heading>
			<Text className="text-[15px] leading-6 text-muted m-0 mb-6">
				Agents don&apos;t need you awake.
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-3">
				<strong>Pick something recurring:</strong> issue triage, changelog
				drafts, dependency bumps. Create an automation and Superset runs an
				agent on schedule, each run in its own workspace.
			</Text>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				You wake up to a diff to review, not a task to start.
			</Text>

			<Section className="mb-8">
				<Button href="https://docs.superset.sh/automations">
					See how automations work
				</Button>
			</Section>

			<Text className="text-[13px] leading-5 text-muted m-0">
				Questions? Just reply. A founder reads every message.
			</Text>
		</EmailLayout>
	);
}

export default ActivationNudge3Automations;
