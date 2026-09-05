import { msg } from "@lingui/core/macro";
import {
	DOWNLOAD_URL_MAC_ARM64,
	PROTOCOL_SCHEMES,
} from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Download, ExternalLink } from "lucide-react";
import { HiCheckCircle } from "react-icons/hi2";
import { i18n } from "@/lib/i18n-server";

export default async function BillingPage({
	searchParams,
}: {
	searchParams: Promise<{ success?: string }>;
}) {
	const { success } = await searchParams;
	const isSuccess = success === "true";

	if (isSuccess) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
				<HiCheckCircle className="h-12 w-12 text-green-500" />
				<h1 className="text-2xl font-semibold">
					{i18n._(
						msg({
							message: "Payment Successful",
						}),
					)}
				</h1>
				<p className="text-muted-foreground">
					{i18n._(
						msg({
							message:
								"Your subscription has been activated. You can now access all Pro features.",
						}),
					)}
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
			<div>
				<h1 className="mb-2 text-2xl font-semibold">
					{i18n._(msg({ message: "Billing" }))}
				</h1>
				<p className="text-muted-foreground">
					{i18n._(
						msg({
							message:
								"Manage your subscription and billing in the desktop app.",
						}),
					)}
				</p>
			</div>
			<div className="flex flex-wrap justify-center gap-3">
				<Button size="lg" className="gap-2" asChild>
					<a href={`${PROTOCOL_SCHEMES.PROD}://settings/billing`}>
						{i18n._(
							msg({
								message: "Open in Desktop App",
							}),
						)}
						<ExternalLink className="size-4" />
					</a>
				</Button>
				<Button variant="outline" size="lg" className="gap-2" asChild>
					<a href={DOWNLOAD_URL_MAC_ARM64}>
						{i18n._(
							msg({
								message: "Download for Mac",
							}),
						)}
						<Download className="size-4" />
					</a>
				</Button>
			</div>
		</div>
	);
}
