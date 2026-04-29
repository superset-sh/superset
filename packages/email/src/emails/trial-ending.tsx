import { Heading, Link, Section, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface TrialEndingEmailProps {
	ownerName?: string | null;
	organizationName: string;
	planName: string;
	trialEndsAt: Date;
	amount: string;
	billingInterval: "monthly" | "yearly";
	billingPortalUrl?: string;
}

export function TrialEndingEmail({
	ownerName = "there",
	organizationName = "Acme Inc",
	planName = "Pro",
	trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
	amount = "$10.00",
	billingInterval = "monthly",
	billingPortalUrl,
}: TrialEndingEmailProps) {
	const intervalText = billingInterval === "monthly" ? "month" : "year";
	const formattedDate = trialEndsAt.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});

	return (
		<StandardLayout preview={`Your Superset ${planName} trial ends in 3 days`}>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Your trial ends in 3 days
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Your <strong>Superset {planName}</strong> trial for{" "}
				<strong>{organizationName}</strong> ends on{" "}
				<strong>{formattedDate}</strong>. We'll automatically charge{" "}
				<strong>
					{amount}/{intervalText}
				</strong>{" "}
				to your card on file unless you cancel before then.
			</Text>

			<Section className="bg-[#f9fafb] rounded-lg p-4 mb-4">
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>Plan:</strong> {planName}
				</Text>
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>Billing starts:</strong> {formattedDate}
				</Text>
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>Amount:</strong> {amount}/{intervalText}
				</Text>
			</Section>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				No action needed if you'd like to keep using Superset {planName} —
				you'll be charged automatically and your team's access continues without
				interruption.
			</Text>

			{billingPortalUrl && (
				<Section className="mt-6 mb-6">
					<Button href={billingPortalUrl}>Manage subscription</Button>
				</Section>
			)}

			<Text className="text-xs leading-5 text-muted">
				Questions?{" "}
				<Link
					href="mailto:support@superset.sh"
					className="text-primary no-underline"
				>
					Reach out to our team
				</Link>{" "}
				— we're happy to help.
			</Text>
		</StandardLayout>
	);
}

export default TrialEndingEmail;
