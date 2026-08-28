import { Heading, Hr, Link, Section, Text } from "@react-email/components";
import { format } from "date-fns";
import { Button, DetailRow, EmailLayout } from "../../components";

interface SubscriptionCancelledEmailProps {
	recipientName?: string | null;
	organizationName: string;
	planName: string;
	accessEndsAt: Date;
	billingPortalUrl?: string;
}

export function SubscriptionCancelledEmail({
	recipientName = "there",
	organizationName = "Acme Inc",
	planName = "Pro",
	accessEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
	billingPortalUrl,
}: SubscriptionCancelledEmailProps) {
	const formattedEndDate = format(accessEndsAt, "MMMM d, yyyy");

	return (
		<EmailLayout preview={`Your ${planName} subscription has been cancelled`}>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				Subscription cancelled
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {recipientName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				Your <strong>{planName}</strong> subscription for{" "}
				<strong>{organizationName}</strong> has been cancelled.
			</Text>

			<Hr className="border-border my-4" />
			<DetailRow label="Access until" value={formattedEndDate} />
			<Hr className="border-border my-4" />

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				You'll continue to have access to all {planName} features until{" "}
				{formattedEndDate}. After that, your organization moves to the free
				plan.
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				Changed your mind? You can resubscribe anytime before your access ends.
			</Text>

			{billingPortalUrl && (
				<Section className="mb-6">
					<Button href={billingPortalUrl}>Resubscribe</Button>
				</Section>
			)}

			<Text className="text-[13px] leading-5 text-muted m-0">
				Something not working?{" "}
				<Link
					href="mailto:support@superset.sh"
					className="text-muted underline"
				>
					Tell us
				</Link>{" "}
				and we'll fix it.
			</Text>
		</EmailLayout>
	);
}

export default SubscriptionCancelledEmail;
