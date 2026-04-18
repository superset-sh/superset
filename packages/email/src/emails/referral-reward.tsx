import { Heading, Section, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface ReferralRewardEmailProps {
	ownerName?: string | null;
	organizationName: string;
	rewardAmount: string;
	refereeName?: string | null;
}

export function ReferralRewardEmail({
	ownerName = "there",
	organizationName = "Acme Inc",
	rewardAmount = "$20.00",
	refereeName = "a friend",
}: ReferralRewardEmailProps) {
	return (
		<StandardLayout preview="You earned a free month of Superset.">
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				You earned a free month of <strong>Superset</strong>
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				<strong>{refereeName ?? "Someone you referred"}</strong> just subscribed
				to Superset Pro. We've credited <strong>{organizationName}</strong>'s
				Stripe customer with <strong>{rewardAmount}</strong> — it'll apply
				automatically to your next invoice.
			</Text>

			<Section className="mt-6 mb-6">
				<Button href="https://app.superset.sh/settings/billing">
					View billing
				</Button>
			</Section>

			<Text className="text-xs leading-5 text-muted">
				Thanks for sharing Superset. Keep inviting — each friend who subscribes
				earns you another free month.
			</Text>
		</StandardLayout>
	);
}

export default ReferralRewardEmail;
