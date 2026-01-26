import { Heading, Section, Text } from "@react-email/components";
import { StandardLayout } from "../components";

interface MemberAddedBillingEmailProps {
	ownerName?: string | null;
	organizationName: string;
	newMemberName: string;
	newMemberEmail: string;
	addedByName: string;
	newSeatCount: number;
	newMonthlyTotal: string;
}

export function MemberAddedBillingEmail({
	ownerName = "there",
	organizationName = "Acme Inc",
	newMemberName = "Jane Doe",
	newMemberEmail = "jane@example.com",
	addedByName = "John Smith",
	newSeatCount = 5,
	newMonthlyTotal = "$50.00",
}: MemberAddedBillingEmailProps) {
	return (
		<StandardLayout
			preview={`Billing update: ${newMemberName} was added to ${organizationName}`}
		>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				New member added to <strong>{organizationName}</strong>
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{addedByName} added a new member to <strong>{organizationName}</strong>:
			</Text>

			<Section className="bg-[#f9fafb] rounded-lg p-4 mb-4">
				<Text className="text-sm leading-5 text-foreground m-0">
					<strong>{newMemberName}</strong>
				</Text>
				<Text className="text-sm leading-5 text-muted m-0">
					{newMemberEmail}
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
				The prorated amount will be reflected in your next invoice.
			</Text>

			<Text className="text-xs leading-5 text-muted">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</StandardLayout>
	);
}

export default MemberAddedBillingEmail;
