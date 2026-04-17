import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import { useEffect, useState } from "react";
import stripeLinkIcon from "renderer/assets/stripe-link.png";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

type BillingDetailsData = NonNullable<
	Awaited<ReturnType<typeof apiTrpcClient.billing.details.query>>
>;

function formatAddress(address: BillingDetailsData["address"]) {
	if (!address) return null;
	const parts = [
		address.line1,
		address.line2,
		[address.city, address.state].filter(Boolean).join(", "),
		address.postalCode,
		address.country,
	].filter(Boolean);
	return parts.join(", ");
}

function capitalizeFirst(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function PaymentMethodLabel({
	paymentMethod,
}: {
	paymentMethod: NonNullable<BillingDetailsData["paymentMethod"]>;
}) {
	if (paymentMethod.type === "link") {
		return (
			<span className="inline-flex items-center gap-1.5">
				<img src={stripeLinkIcon} alt="Link" className="h-4 w-4 rounded-sm" />
				<span>Link by Stripe</span>
			</span>
		);
	}

	if (paymentMethod.last4) {
		return (
			<span>
				{capitalizeFirst(paymentMethod.brand)} ending in {paymentMethod.last4}
			</span>
		);
	}

	return <span>{capitalizeFirst(paymentMethod.brand)}</span>;
}

export function BillingDetails() {
	const [details, setDetails] = useState<BillingDetailsData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [openingPortal, setOpeningPortal] = useState<string | null>(null);
	const openUrl = electronTrpc.external.openUrl.useMutation();

	useEffect(() => {
		apiTrpcClient.billing.details
			.query()
			.then(setDetails)
			.catch(() => {})
			.finally(() => setIsLoading(false));
	}, []);

	const handleEdit = async (flowType: "payment_method_update" | "general") => {
		setOpeningPortal(flowType);
		try {
			const result = await apiTrpcClient.billing.portal.mutate({ flowType });
			if (result?.url) {
				openUrl.mutate(result.url);
			}
		} catch {
			// Silently handle
		} finally {
			setOpeningPortal(null);
		}
	};

	if (isLoading || !details) return null;

	const addressStr = formatAddress(details.address);

	return (
		<div>
			<h3 className="text-sm font-medium mb-3">Billing details</h3>
			<div className="space-y-2">
				<Card className="gap-0 rounded-lg border-border/60 py-0 shadow-none">
					<CardContent className="px-5 py-4">
						<div className="flex items-center justify-between">
							<div className="min-w-0 flex-1">
								<span className="text-sm font-medium">
									{details.name ?? "No name on file"}
								</span>
								{addressStr && (
									<p className="text-xs text-muted-foreground mt-0.5">
										{addressStr}
									</p>
								)}
								{details.email && (
									<p className="text-xs text-muted-foreground mt-0.5">
										{details.email}
									</p>
								)}
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleEdit("general")}
								disabled={openingPortal !== null}
							>
								Edit
							</Button>
						</div>
					</CardContent>
				</Card>

				<Card className="gap-0 rounded-lg border-border/60 py-0 shadow-none">
					<CardContent className="px-5 py-4">
						<div className="flex items-center justify-between">
							<div className="min-w-0 flex-1">
								<span className="text-sm font-medium">Payment method</span>
								<p className="text-xs text-muted-foreground mt-0.5">
									{details.paymentMethod ? (
										<PaymentMethodLabel paymentMethod={details.paymentMethod} />
									) : (
										"No payment method on file"
									)}
								</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleEdit("payment_method_update")}
								disabled={openingPortal !== null}
							>
								Edit
							</Button>
						</div>
					</CardContent>
				</Card>

				<Card className="gap-0 rounded-lg border-border/60 py-0 shadow-none">
					<CardContent className="px-5 py-4">
						<div className="flex items-center justify-between">
							<div className="min-w-0 flex-1">
								<p className="text-xs text-muted-foreground">
									{details.taxId
										? `${details.taxId.type.toUpperCase().replace("_", " ")} · ${details.taxId.value}`
										: "No tax identifier on file"}
								</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleEdit("general")}
								disabled={openingPortal !== null}
							>
								{details.taxId ? "Edit" : "Add tax ID"}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
