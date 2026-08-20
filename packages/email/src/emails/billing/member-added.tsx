import { Heading, Hr, Text } from "@react-email/components";
import { DetailRow, EmailLayout } from "../../components";

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
		<EmailLayout
			preview={`Billing update: ${newMemberName} was added to ${organizationName}`}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				New member added to {organizationName}
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				{addedByName} added <strong>{newMemberName}</strong> ({newMemberEmail})
				to <strong>{organizationName}</strong>. Your subscription has been
				updated:
			</Text>

			<Hr className="border-border my-4" />
			<DetailRow label="Seats" value={String(newSeatCount)} />
			<DetailRow label="New monthly total" value={newMonthlyTotal} />
			<Hr className="border-border my-4" />

			<Text className="text-[13px] leading-5 text-muted m-0 mb-4">
				Your next invoice will include the prorated amount.
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</EmailLayout>
	);
}

export default MemberAddedBillingEmail;
