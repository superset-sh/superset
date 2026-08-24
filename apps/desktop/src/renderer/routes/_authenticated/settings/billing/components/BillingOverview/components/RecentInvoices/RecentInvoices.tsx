import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { format } from "date-fns";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";

function formatAmount(amount: number, currency: string) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount / 100);
}

function formatDate(timestamp: number) {
	return format(new Date(timestamp * 1000), "MMM d, yyyy");
}

const UNPAID_LABEL: Record<string, string> = {
	open: "Unpaid",
	uncollectible: "Unpaid",
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
									invoice.isUnpaid && "text-amber-500 font-medium",
								)}
							>
								{formatAmount(
									invoice.isUnpaid ? invoice.amountDue : invoice.amountPaid,
									invoice.currency,
								)}
							</span>
							{invoice.isUnpaid && (
								<span className="inline-flex items-center rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
									{UNPAID_LABEL[invoice.status ?? ""] ?? "Unpaid"}
								</span>
							)}
						</div>
						{invoice.hostedInvoiceUrl ? (
							invoice.isUnpaid ? (
								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										openUrl.mutate(invoice.hostedInvoiceUrl as string)
									}
									className="text-amber-500 hover:text-amber-500"
								>
									Pay now
									<HiArrowTopRightOnSquare className="h-3 w-3" />
								</Button>
							) : (
								<button
									type="button"
									onClick={() =>
										openUrl.mutate(invoice.hostedInvoiceUrl as string)
									}
									className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
								>
									View
									<HiArrowTopRightOnSquare className="h-3 w-3" />
								</button>
							)
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}
