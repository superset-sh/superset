import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
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
				<span>
					<Trans>Link by Stripe</Trans>
				</span>
			</span>
		);
	}

	if (paymentMethod.last4) {
		return (
			<span>
				<Trans>
					{capitalizeFirst(paymentMethod.brand)} ending in {paymentMethod.last4}
				</Trans>
			</span>
		);
	}

	return <span>{capitalizeFirst(paymentMethod.brand)}</span>;
}

export function BillingDetails() {
	const { t } = useLingui();
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
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t({
							message: "Failed to open the billing portal",
						}),
			);
		} finally {
			setOpeningPortal(null);
		}
	};

	if (isLoading || !details) return null;

	const addressStr = formatAddress(details.address);

	return (
		<div>
			<h3 className="text-sm font-medium mb-2">
				<Trans>Billing details</Trans>
			</h3>
			<div>
				<DetailRow
					label={
						details.name ??
						t({
							message: "No name on file",
						})
					}
					hint={
						<>
							{addressStr && <div>{addressStr}</div>}
							{details.email && <div>{details.email}</div>}
						</>
					}
					action={
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleEdit("general")}
							disabled={openingPortal !== null}
						>
							<Trans>Edit</Trans>
						</Button>
					}
				/>
				<DetailRow
					label={t({
						message: "Payment method",
					})}
					hint={
						details.paymentMethod ? (
							<PaymentMethodLabel paymentMethod={details.paymentMethod} />
						) : (
							t({
								message: "No payment method on file",
							})
						)
					}
					action={
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleEdit("payment_method_update")}
							disabled={openingPortal !== null}
						>
							<Trans>Edit</Trans>
						</Button>
					}
				/>
				<DetailRow
					label={t({ message: "Tax ID" })}
					hint={
						details.taxId
							? `${details.taxId.type.toUpperCase().replace("_", " ")} · ${details.taxId.value}`
							: t({
									message: "No tax identifier on file",
								})
					}
					action={
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleEdit("general")}
							disabled={openingPortal !== null}
						>
							{details.taxId ? <Trans>Edit</Trans> : <Trans>Add tax ID</Trans>}
						</Button>
					}
				/>
			</div>
		</div>
	);
}

interface DetailRowProps {
	label: React.ReactNode;
	hint?: React.ReactNode;
	action: React.ReactNode;
}

function DetailRow({ label, hint, action }: DetailRowProps) {
	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{label}</div>
				{hint && (
					<div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
				)}
			</div>
			<div className="shrink-0">{action}</div>
		</div>
	);
}
