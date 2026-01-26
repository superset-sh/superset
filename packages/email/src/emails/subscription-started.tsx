import { Heading, Section, Text } from "@react-email/components";
import { StandardLayout } from "../components";

interface SubscriptionStartedEmailProps {
	ownerName?: string | null;
	organizationName: string;
	planName: string;
	billingInterval: "monthly" | "yearly";
	amount: string;
	seatCount: number;
}

export function SubscriptionStartedEmail({
	ownerName = "there",
	organizationName = "Acme Inc",
	planName = "Pro",
	billingInterval = "monthly",
	amount = "$10.00",
	seatCount = 1,
}: SubscriptionStartedEmailProps) {
	const intervalText = billingInterval === "monthly" ? "month" : "year";

	return (
		<StandardLayout preview={`Welcome to Superset ${planName}!`}>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Welcome to <strong>Superset {planName}</strong>! 🎉
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Thanks for upgrading <strong>{organizationName}</strong> to the{" "}
				<strong>{planName}</strong> plan. Your subscription is now active.
			</Text>

			<Section className="bg-[#f9fafb] rounded-lg p-4 mb-4">
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>Plan:</strong> {planName}
				</Text>
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>Billing:</strong> {amount}/{intervalText}
				</Text>
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>Seats:</strong> {seatCount}
				</Text>
			</Section>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				With {planName}, you now have access to:
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-1">
				✓ Unlimited team members
			</Text>
			<Text className="text-base leading-[26px] text-foreground mb-1">
				✓ Advanced workflow automation
			</Text>
			<Text className="text-base leading-[26px] text-foreground mb-1">
				✓ Priority support
			</Text>
			<Text className="text-base leading-[26px] text-foreground mb-4">
				✓ And much more...
			</Text>

			<Text className="text-xs leading-5 text-muted">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</StandardLayout>
	);
}

export default SubscriptionStartedEmail;
