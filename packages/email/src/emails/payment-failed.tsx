import { Heading, Link, Section, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface PaymentFailedEmailProps {
	ownerName?: string | null;
	organizationName: string;
	planName: string;
	amount: string;
	nextRetryDate?: Date | null;
	billingPortalUrl?: string;
}

export function PaymentFailedEmail({
	ownerName = "there",
	organizationName = "Acme Inc",
	planName = "Pro",
	amount = "$50.00",
	nextRetryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
	billingPortalUrl,
}: PaymentFailedEmailProps) {
	return (
		<StandardLayout preview={`Payment failed for ${organizationName}`}>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Payment failed
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				We were unable to process the payment of <strong>{amount}</strong> for{" "}
				<strong>{organizationName}</strong>'s <strong>{planName}</strong>{" "}
				subscription.
			</Text>

			<Section className="bg-[#fef2f2] border border-[#fecaca] rounded-lg p-4 mb-4">
				<Text className="text-sm leading-5 text-[#991b1b] m-0">
					<strong>Action required:</strong> Please update your payment method to
					avoid service interruption.
				</Text>
			</Section>

			{nextRetryDate && (
				<Text className="text-base leading-[26px] text-foreground mb-4">
					We'll automatically retry the payment in a few days. To avoid any
					disruption, please update your payment method now.
				</Text>
			)}

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Common reasons for payment failure:
			</Text>

			<Text className="text-sm leading-6 text-muted mb-1">
				• Card expired or about to expire
			</Text>
			<Text className="text-sm leading-6 text-muted mb-1">
				• Insufficient funds
			</Text>
			<Text className="text-sm leading-6 text-muted mb-1">
				• Card blocked by your bank
			</Text>
			<Text className="text-sm leading-6 text-muted mb-4">
				• Incorrect billing information
			</Text>

			{billingPortalUrl && (
				<Section className="mt-6 mb-6">
					<Button href={billingPortalUrl}>Update Payment Method</Button>
				</Section>
			)}

			<Text className="text-xs leading-5 text-muted">
				Need help?{" "}
				<Link
					href="mailto:support@superset.sh"
					className="text-primary no-underline"
				>
					Contact our support team
				</Link>{" "}
				and we'll get you sorted out.
			</Text>
		</StandardLayout>
	);
}

export default PaymentFailedEmail;
