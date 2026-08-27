import {
	formatDate as formatLocaleDate,
	formatPrice,
} from "@superset/i18n/format";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";

function formatDate(timestamp: number) {
	return formatLocaleDate(new Date(timestamp * 1000));
}

const UNPAID_LABEL: Record<string, string> = {
	open: "Unpaid",
	uncollectible: "Uncollectible",
};

export function RecentInvoices() {
	// cloudTrpc, not the imperative client: it sends this window's organization
	// header, so the list belongs to the organization on screen.
	const { data: invoices } = cloudTrpc.billing.invoices.useQuery(undefined);
	const openUrl = electronTrpc.external.openUrl.useMutation();

	if (!invoices || invoices.length === 0) {
		return null;
	}

	return (
		<div>
			<h3 className="text-sm font-medium mb-2">Recent invoices</h3>
			<div className="divide-y divide-border">
				{invoices.map((invoice) => (
					<div
						key={invoice.id}
						className="flex items-center justify-between gap-8 py-3"
					>
						<div className="flex items-center gap-6 text-sm">
							<span className="text-muted-foreground tabular-nums">
								{formatDate(invoice.date)}
							</span>
							<span
								className={cn(
									"tabular-nums",
									invoice.isUnpaid && "font-medium",
								)}
							>
								{formatPrice(
									invoice.isUnpaid ? invoice.amountDue : invoice.amountPaid,
									invoice.currency,
								)}
							</span>
							{invoice.isUnpaid && (
								<Badge
									variant="outline"
									className="border-warning/30 bg-warning/10 text-warning"
								>
									{UNPAID_LABEL[invoice.status ?? ""] ?? "Unpaid"}
								</Badge>
							)}
						</div>
						{invoice.hostedInvoiceUrl ? (
							<button
								type="button"
								onClick={() =>
									openUrl.mutate(invoice.hostedInvoiceUrl as string)
								}
								className={cn(
									"flex items-center gap-1 text-xs",
									invoice.isUnpaid
										? "text-warning hover:text-warning/80"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{invoice.isUnpaid ? "Pay now" : "View"}
								<HiArrowTopRightOnSquare className="h-3 w-3" />
							</button>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}
