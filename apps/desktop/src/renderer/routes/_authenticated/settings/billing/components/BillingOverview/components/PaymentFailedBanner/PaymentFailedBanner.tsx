import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { LuTriangleAlert } from "react-icons/lu";

interface PaymentFailedBannerProps {
	amountDue: string | null;
	hostedInvoiceUrl: string | null;
	onPayInvoice?: (hostedInvoiceUrl: string) => void;
	className?: string;
}

/**
 * A failed charge is a problem with the account, not with any one row, so it
 * gets the page's alert slot rather than a chip beside the plan name. Matches
 * RelayOfflineNotice, the established banner in the app.
 */
export function PaymentFailedBanner({
	amountDue,
	hostedInvoiceUrl,
	onPayInvoice,
	className,
}: PaymentFailedBannerProps) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-foreground/85 select-text cursor-text",
				className,
			)}
		>
			<div className="flex min-w-[240px] flex-1 items-start gap-2">
				<LuTriangleAlert
					className="mt-0.5 size-3.5 shrink-0 text-warning"
					aria-hidden="true"
				/>
				<span>
					<span className="font-medium">Payment failed.</span>{" "}
					{amountDue
						? `We couldn't charge ${amountDue}. Update your payment method to keep this plan.`
						: "We couldn't charge your payment method. Update it to keep this plan."}
				</span>
			</div>
			{hostedInvoiceUrl && onPayInvoice && (
				<Button
					variant="outline"
					size="sm"
					className="ml-auto h-7 shrink-0 border-warning/40 bg-warning/10 px-2.5 text-xs text-warning hover:bg-warning/20"
					onClick={() => onPayInvoice(hostedInvoiceUrl)}
				>
					Pay now
				</Button>
			)}
		</div>
	);
}
