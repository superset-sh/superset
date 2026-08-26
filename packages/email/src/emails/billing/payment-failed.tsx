import { Heading, Link, Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../../components";

interface PaymentFailedEmailProps {
	recipientName?: string | null;
	organizationName: string;
	planName: string;
	amount: string;
	nextRetryDate?: Date | null;
	billingPortalUrl?: string;
}

export function PaymentFailedEmail({
	recipientName = "there",
	organizationName = "Acme Inc",
	planName = "Pro",
	amount = "$50.00",
	nextRetryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
	billingPortalUrl,
}: PaymentFailedEmailProps) {
	return (
		<EmailLayout preview={`Payment failed for ${organizationName}`}>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				Payment failed
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {recipientName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				We couldn't process the <strong>{amount}</strong> payment for{" "}
				<strong>{organizationName}</strong>'s <strong>{planName}</strong>{" "}
				subscription.
			</Text>

			<Section className="bg-[#fef2f2] border border-solid border-[#fecaca] rounded-lg p-4 mb-4">
				<Text className="text-[14px] leading-5 text-[#991b1b] m-0">
					<strong>Action required:</strong> Update your payment method so your
					team doesn't lose {planName} access.
				</Text>
			</Section>

			{nextRetryDate && (
				<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
					We'll automatically retry the payment in a few days.
				</Text>
			)}

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				Common reasons for payment failure:
			</Text>

			<Text className="text-[13px] leading-6 text-muted m-0 mb-6">
				• Card expired or about to expire
				<br />• Insufficient funds
				<br />• Card blocked by your bank
				<br />• Incorrect billing information
			</Text>

			{billingPortalUrl && (
				<Section className="mb-6">
					<Button href={billingPortalUrl}>Update Payment Method</Button>
				</Section>
			)}

			<Text className="text-[13px] leading-5 text-muted m-0">
				Need help?{" "}
				<Link
					href="mailto:support@superset.sh"
					className="text-muted underline"
				>
					Contact our support team
				</Link>{" "}
				and we'll get you sorted out.
			</Text>
		</EmailLayout>
	);
}

export default PaymentFailedEmail;
