import { Heading, Link, Section, Text } from "@react-email/components";
import { format } from "date-fns";
import { Button, StandardLayout } from "../components";

interface SubscriptionCancelledEmailProps {
	ownerName?: string | null;
	organizationName: string;
	planName: string;
	accessEndsAt: Date;
	billingPortalUrl?: string;
}

export function SubscriptionCancelledEmail({
	ownerName = "there",
	organizationName = "Acme Inc",
	planName = "Pro",
	accessEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
	billingPortalUrl,
}: SubscriptionCancelledEmailProps) {
	const formattedEndDate = format(accessEndsAt, "MMMM d, yyyy");

	return (
		<StandardLayout
			preview={`Your ${planName} subscription has been cancelled`}
		>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Subscription cancelled
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Your <strong>{planName}</strong> subscription for{" "}
				<strong>{organizationName}</strong> has been cancelled.
			</Text>

			<Section className="bg-[#f9fafb] rounded-lg p-4 mb-4">
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>Access until:</strong> {formattedEndDate}
				</Text>
			</Section>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				You'll continue to have access to all {planName} features until{" "}
				{formattedEndDate}. After that, your organization will be moved to the
				free plan.
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Changed your mind? You can resubscribe anytime before your access ends.
			</Text>

			{billingPortalUrl && (
				<Section className="mt-6 mb-6">
					<Button href={billingPortalUrl}>Resubscribe</Button>
				</Section>
			)}

			<Text className="text-xs leading-5 text-muted">
				We'd love to hear your feedback.{" "}
				<Link
					href="mailto:support@superset.sh"
					className="text-primary no-underline"
				>
					Let us know
				</Link>{" "}
				why you cancelled so we can improve.
			</Text>
		</StandardLayout>
	);
}

export default SubscriptionCancelledEmail;
