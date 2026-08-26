import { Heading, Hr, Text } from "@react-email/components";
import { DetailRow, EmailLayout } from "../../components";

interface MemberRemovedBillingEmailProps {
	recipientName?: string | null;
	organizationName: string;
	removedMemberName: string;
	removedMemberEmail: string;
	removedByName: string;
	newSeatCount: number;
	newMonthlyTotal: string;
	billingInterval?: "monthly" | "yearly";
	prorationAmount?: string | null;
	nextInvoiceTotal?: string | null;
}

export function MemberRemovedBillingEmail({
	recipientName = "there",
	organizationName = "Acme Inc",
	removedMemberName = "Jane Doe",
	removedMemberEmail = "jane@example.com",
	removedByName = "John Smith",
	newSeatCount = 4,
	newMonthlyTotal = "$40.00",
	billingInterval = "monthly",
	prorationAmount = "-$8.20",
	nextInvoiceTotal = "$31.80",
}: MemberRemovedBillingEmailProps) {
	const hasPreview = Boolean(prorationAmount && nextInvoiceTotal);
	// unit_amount is per billing period, so on an annual price this total is
	// yearly. Labelling it monthly understates the charge twelvefold.
	const totalLabel =
		billingInterval === "yearly" ? "New yearly total" : "New monthly total";

	return (
		<EmailLayout
			preview={`Billing update: ${removedMemberName} was removed from ${organizationName}`}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				Member removed from {organizationName}
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {recipientName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				{removedByName} removed <strong>{removedMemberName}</strong> (
				{removedMemberEmail}) from <strong>{organizationName}</strong>. Your
				subscription has been updated:
			</Text>

			<Hr className="border-border my-4" />
			<DetailRow label="Seats" value={String(newSeatCount)} />
			<DetailRow label={totalLabel} value={newMonthlyTotal} />
			{hasPreview && (
				<>
					<DetailRow
						label="Credit for the rest of this period"
						value={prorationAmount as string}
					/>
					<DetailRow label="Next invoice" value={nextInvoiceTotal as string} />
				</>
			)}
			<Hr className="border-border my-4" />

			<Text className="text-[13px] leading-5 text-muted m-0 mb-4">
				{hasPreview
					? `Your next invoice is ${nextInvoiceTotal} — the new plan total with ${prorationAmount} credited for the unused time on the removed seat.`
					: "Your next invoice includes a credit for the unused time on the removed seat, so it will differ from the plan total above."}
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				You're receiving this because you manage billing for {organizationName}.
			</Text>
		</EmailLayout>
	);
}

export default MemberRemovedBillingEmail;
