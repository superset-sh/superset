import { HiCheckCircle } from "react-icons/hi2";

export default async function BillingPage({
	searchParams,
}: {
	searchParams: Promise<{ success?: string }>;
}) {
	const { success } = await searchParams;
	const isSuccess = success === "true";

	if (!isSuccess) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<p className="text-muted-foreground">
					Manage your billing in the desktop app.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
			<HiCheckCircle className="h-12 w-12 text-green-500" />
			<h1 className="text-2xl font-semibold">Payment Successful</h1>
			<p className="text-muted-foreground">
				Your subscription has been activated. You can now access all Pro
				features.
			</p>
		</div>
	);
}
