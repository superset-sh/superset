import { Heading, Section, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface ReferralWelcomeEmailProps {
	refereeName?: string | null;
	referrerOrganizationName: string;
}

export function ReferralWelcomeEmail({
	refereeName = "there",
	referrerOrganizationName = "Acme Inc",
}: ReferralWelcomeEmailProps) {
	return (
		<StandardLayout preview="Welcome to Superset — your first month's on us.">
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Your first month of <strong>Superset</strong> is on us
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {refereeName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Thanks for joining Superset through{" "}
				<strong>{referrerOrganizationName}</strong>'s invite. When you upgrade
				to Pro, your first month is free — no commitment, full access.
			</Text>

			<Section className="mt-6 mb-6">
				<Button href="https://app.superset.sh/settings/billing/plans">
					Start your free month
				</Button>
			</Section>

			<Text className="text-xs leading-5 text-muted">
				The free month kicks in automatically at checkout. You can cancel any
				time before the trial ends and won't be charged.
			</Text>
		</StandardLayout>
	);
}

export default ReferralWelcomeEmail;
