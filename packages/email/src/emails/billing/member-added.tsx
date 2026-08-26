import { Heading, Hr, Text } from "@react-email/components";
import { DetailRow, EmailLayout } from "../../components";

interface MemberAddedBillingEmailProps {
	recipientName?: string | null;
	organizationName: string;
	newMemberName: string;
	newMemberEmail: string;
	addedByName: string;
	newSeatCount: number;
	newMonthlyTotal: string;
	billingInterval?: "monthly" | "yearly";
	prorationAmount?: string | null;
	nextInvoiceTotal?: string | null;
}

export function MemberAddedBillingEmail({
	recipientName = "there",
	organizationName = "Acme Inc",
	newMemberName = "Jane Doe",
	newMemberEmail = "jane@example.com",
	addedByName = "John Smith",
	newSeatCount = 5,
	newMonthlyTotal = "$50.00",
	billingInterval = "monthly",
	prorationAmount = "$12.40",
	nextInvoiceTotal = "$62.40",
}: MemberAddedBillingEmailProps) {
	const hasPreview = Boolean(prorationAmount && nextInvoiceTotal);
	// unit_amount is per billing period, so on an annual price this total is
	// yearly. Labelling it monthly understates the charge twelvefold.
	const totalLabel =
		billingInterval === "yearly" ? "New yearly total" : "New monthly total";

	return (
		<EmailLayout
			preview={`Billing update: ${newMemberName} was added to ${organizationName}`}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				New member added to {organizationName}
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {recipientName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				{addedByName} added <strong>{newMemberName}</strong> ({newMemberEmail})
				to <strong>{organizationName}</strong>. Your subscription has been
				updated:
			</Text>

			<Hr className="border-border my-4" />
			<DetailRow label="Seats" value={String(newSeatCount)} />
			<DetailRow label={totalLabel} value={newMonthlyTotal} />
			{hasPreview && (
				<>
					<DetailRow
						label="Prorated for the rest of this period"
						value={prorationAmount as string}
					/>
					<DetailRow label="Next invoice" value={nextInvoiceTotal as string} />
				</>
			)}
			<Hr className="border-border my-4" />

			<Text className="text-[13px] leading-5 text-muted m-0 mb-4">
				{hasPreview
					? `Your next invoice is ${nextInvoiceTotal} — the new plan total plus ${prorationAmount} for the part of the current period the new seat covers.`
					: "Your next invoice adds a prorated charge for the rest of the current period, so it will be higher than the plan total above."}
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				You're receiving this because you manage billing for {organizationName}.
			</Text>
		</EmailLayout>
	);
}

export default MemberAddedBillingEmail;
