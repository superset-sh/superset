import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import Link from "next/link";
import { HiCheckCircle } from "react-icons/hi2";
import { initServerI18n } from "@/lib/i18n-server";
import { BillingSettings } from "./components/BillingSettings";

export default async function BillingPage({
	searchParams,
}: {
	searchParams: Promise<{ success?: string; organization?: string }>;
}) {
	const { success, organization } = await searchParams;

	if (success === "true") {
		const i18n = await initServerI18n();
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
				<HiCheckCircle className="h-12 w-12 text-green-500" />
				<h1 className="text-2xl font-semibold">
					{i18n._(msg({ message: "Payment Successful" }))}
				</h1>
				<p className="text-muted-foreground">
					{i18n._(
						msg({
							message:
								"Your subscription has been activated. You can now access all Pro features.",
						}),
					)}
				</p>
				<Button variant="outline" className="mt-3" asChild>
					<Link href="/settings/billing">
						{i18n._(msg({ message: "Back to billing" }))}
					</Link>
				</Button>
			</div>
		);
	}

	return <BillingSettings organizationId={organization} />;
}
