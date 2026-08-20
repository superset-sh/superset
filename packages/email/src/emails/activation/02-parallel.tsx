import { Heading, Link, Section, Text } from "@react-email/components";
import { EmailLayout } from "../../components";

// Sent after the first workspace exists. The isolation nudge removes fear;
// this one escalates to the actual habit: several agents running at once.

interface ActivationNudge2ParallelProps {
	userEmail?: string;
	unsubscribeUrl?: string;
}

export function ActivationNudge2Parallel({
	userEmail,
	unsubscribeUrl,
}: ActivationNudge2ParallelProps = {}) {
	return (
		<EmailLayout
			preview="Queue three tasks before your next meeting."
			recipientEmail={userEmail}
			unsubscribeUrl={unsubscribeUrl}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-3">
				The day it clicks
			</Heading>
			<Text className="text-[15px] leading-6 text-muted m-0 mb-6">
				Superset gets good the day you stop watching one agent work.
			</Text>

			<Section className="bg-surface border border-solid border-border rounded-lg p-5 mb-6">
				<Text className="text-[15px] leading-6 text-foreground m-0 mb-3">
					<strong>Before your next meeting, kick off three workspaces:</strong>{" "}
					the bug you were assigned, the rename you&apos;ve been avoiding, and
					the doc nobody updated.
				</Text>
				<Text className="text-[15px] leading-6 text-foreground m-0">
					Each runs in its own copy of your repo. Review the diffs when
					you&apos;re back.
				</Text>
			</Section>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				Agents do the work in parallel. You review the diffs and spend your time
				shipping, not waiting.
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0 mb-2">
				Prefer a guided run? The{" "}
				<Link
					href="https://docs.superset.sh/first-workspace"
					className="text-muted underline"
				>
					ten-minute tutorial
				</Link>{" "}
				races three agents on one prompt and ships the winner.
			</Text>
			<Text className="text-[13px] leading-5 text-muted m-0">
				Questions? Just reply. A founder reads every message.
			</Text>
		</EmailLayout>
	);
}

export default ActivationNudge2Parallel;
