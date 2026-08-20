import { Heading, Hr, Text } from "@react-email/components";
import { DetailRow, EmailLayout } from "../../components";

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
		<EmailLayout
			preview={`Billing update: ${removedMemberName} was removed from ${organizationName}`}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				Member removed from {organizationName}
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				{removedByName} removed <strong>{removedMemberName}</strong> (
				{removedMemberEmail}) from <strong>{organizationName}</strong>. Your
				subscription has been updated:
			</Text>

			<Hr className="border-border my-4" />
			<DetailRow label="Seats" value={String(newSeatCount)} />
			<DetailRow label="New monthly total" value={newMonthlyTotal} />
			<Hr className="border-border my-4" />

			<Text className="text-[13px] leading-5 text-muted m-0 mb-4">
				Your next invoice will include a credit for the unused time.
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</EmailLayout>
	);
}

export default MemberRemovedBillingEmail;
