import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailTheme } from "../../components";

// Sent instead of 01-first-agent when the Resend automation has seen
// `app.first_opened`: the user installed the app but hasn't created a
// workspace, so the nudge is a paste-able first prompt, not a download link.

interface ActivationNudge1InstalledProps {
	userEmail?: string;
	unsubscribeUrl?: string;
}

export function ActivationNudge1Installed({
	userEmail,
	unsubscribeUrl,
}: ActivationNudge1InstalledProps = {}) {
	return (
		<EmailLayout
			preview="Open a repo and paste this."
			recipientEmail={userEmail}
			unsubscribeUrl={unsubscribeUrl}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-3">
				Your first agent is one prompt away
			</Heading>
			<Text className="text-[15px] leading-6 text-muted m-0 mb-6">
				You&apos;ve got the app. The next step takes two minutes.
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Open a repo you&apos;re working on, create a workspace, and paste this:
			</Text>

			<Section className="bg-surface border border-solid border-border rounded-lg p-5 mb-6">
				<Text
					className="text-[13px] leading-6 text-foreground m-0"
					style={{ fontFamily: emailTheme.fonts.mono }}
				>
					Find a small bug in this repo and fix it. Explain the bug and the fix
					in your final message.
				</Text>
			</Section>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				The agent works in an isolated copy of your repo, so your checkout stays
				untouched. If the result is garbage, delete the workspace.
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				Stuck on anything? Just reply. A founder reads every message.
			</Text>
		</EmailLayout>
	);
}

export default ActivationNudge1Installed;
