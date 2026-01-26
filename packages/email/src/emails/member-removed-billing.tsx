import { Heading, Section, Text } from "@react-email/components";
import { StandardLayout } from "../components";

interface MemberRemovedBillingEmailProps {
	ownerName?: string | null;
	organizationName: string;
	removedMemberName: string;
	removedMemberEmail: string;
	removedByName: string;
	newSeatCount: number;
	newMonthlyTotal: string;
}

export function MemberRemovedBillingEmail({
	ownerName = "there",
	organizationName = "Acme Inc",
	removedMemberName = "Jane Doe",
	removedMemberEmail = "jane@example.com",
	removedByName = "John Smith",
	newSeatCount = 4,
	newMonthlyTotal = "$40.00",
}: MemberRemovedBillingEmailProps) {
	return (
		<StandardLayout
			preview={`Billing update: ${removedMemberName} was removed from ${organizationName}`}
		>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Member removed from <strong>{organizationName}</strong>
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{removedByName} removed a member from{" "}
				<strong>{organizationName}</strong>:
			</Text>

			<Section className="bg-[#f9fafb] rounded-lg p-4 mb-4">
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>{removedMemberName}</strong>
				</Text>
				<Text className="text-sm leading-5 text-muted m-0">
					{removedMemberEmail}
				</Text>
			</Section>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Your subscription has been updated:
			</Text>

			<Section className="bg-[#f9fafb] rounded-lg p-4 mb-4">
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>Seats:</strong> {newSeatCount}
				</Text>
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>New monthly total:</strong> {newMonthlyTotal}
				</Text>
			</Section>

			<Text className="text-sm leading-5 text-muted mb-4">
				A credit will be applied to your next invoice for the unused time.
			</Text>

			<Text className="text-xs leading-5 text-muted">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</StandardLayout>
	);
}

export default MemberRemovedBillingEmail;
