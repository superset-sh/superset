import { msg } from "@lingui/core/macro";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { notFound } from "next/navigation";
import { initServerI18n } from "@/lib/i18n-server";
import { api } from "@/trpc/server";
import { ConnectorConnect } from "./components/ConnectorConnect";

export default async function ConnectorPage({
	params,
}: {
	params: Promise<{ connector: string }>;
}) {
	const { connector: slug } = await params;
	const i18n = await initServerI18n();
	const trpc = await api();
	const organization = await trpc.user.myOrganization.query();

	if (!organization) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<p className="text-muted-foreground">
					{i18n._(
						msg({
							message:
								"You need to be part of an organization to connect accounts.",
						}),
					)}
				</p>
			</div>
		);
	}

	const connector = await trpc.connectors.get.query({ slug }).catch(() => null);
	if (!connector) notFound();

	const live = await trpc.connectors.status.query({
		organizationId: organization.id,
	});
	const connection = live.find((row) => row.connector === slug) ?? null;

	return (
		<div className="mx-auto max-w-xl space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">{connector.displayName}</h1>
				<p className="mt-1 text-muted-foreground">
					{connector.scope === "org"
						? i18n._(
								msg({
									message: "Connects for your whole team.",
								}),
							)
						: i18n._(
								msg({
									message:
										"Connects your account. Teammates connect their own.",
								}),
							)}
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>
						{i18n._(
							msg({
								message: "Connection",
							}),
						)}
					</CardTitle>
					<CardDescription>
						{i18n._(
							msg({
								message:
									"Authorize Superset so your plugins, automations and triggers can act on your behalf.",
							}),
						)}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectorConnect
						slug={slug}
						displayName={connector.displayName}
						organizationId={organization.id}
						methods={connector.methods}
						connection={
							connection
								? {
										id: connection.id,
										externalAccountLabel: connection.externalAccountLabel,
										externalUserLabel: connection.externalUserLabel,
									}
								: null
						}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
