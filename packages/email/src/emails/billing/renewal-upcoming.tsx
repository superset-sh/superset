import { Heading, Hr, Text } from "@react-email/components";
import { format } from "date-fns";
import { DetailRow, EmailLayout } from "../../components";

interface RenewalUpcomingEmailProps {
	recipientName?: string | null;
	organizationName: string;
	planName: string;
	amount: string;
	renewsAt: Date;
	seatCount: number;
	/** Payment methods are owner-only, so an admin gets told to ask one. */
	isOwner?: boolean;
}

/**
 * Annual plans only. A monthly subscriber is reminded by the charge itself
 * twelve times a year, and telling them a week early mostly prompts a cancel;
 * a yearly subscriber has heard nothing since signup and gets a charge an
 * order of magnitude larger. Seat changes are already covered the moment they
 * happen by the member-added and member-removed billing emails, which quote
 * the next invoice exactly.
 */
export function RenewalUpcomingEmail({
	recipientName = "there",
	organizationName = "Acme Inc",
	planName = "Pro",
	amount = "$200.00",
	renewsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
	seatCount = 1,
	isOwner = true,
}: RenewalUpcomingEmailProps) {
	const formattedRenewalDate = format(renewsAt, "MMMM d, yyyy");

	return (
		<EmailLayout
			preview={`${organizationName}'s ${planName} plan renews ${formattedRenewalDate}`}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				Your plan renews on {formattedRenewalDate}
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				Hi {recipientName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				<strong>{organizationName}</strong>'s annual <strong>{planName}</strong>{" "}
				subscription renews on {formattedRenewalDate}. Nothing is due yet — this
				is a heads-up so the charge isn't a surprise.
			</Text>

			<Hr className="border-border my-4" />
			<DetailRow label="Renews on" value={formattedRenewalDate} />
			<DetailRow label="Amount" value={amount} />
			<DetailRow
				label="Seats"
				value={seatCount === 1 ? "1 seat" : `${seatCount} seats`}
			/>
			<Hr className="border-border my-4" />

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				We'll charge the payment method on file. If that card has changed since
				last year,{" "}
				{isOwner ? (
					<>
						update it before {formattedRenewalDate} so the renewal doesn't fail
						— open Superset and go to <strong>Settings → Billing</strong>.
					</>
				) : (
					<>
						ask an owner to update it before {formattedRenewalDate} so the
						renewal doesn't fail. Only owners can change the payment method.
					</>
				)}
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				You're receiving this because you manage billing for {organizationName}.
			</Text>
		</EmailLayout>
	);
}

export default RenewalUpcomingEmail;
