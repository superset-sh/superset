import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";

import { env } from "@/env";
import { api } from "@/trpc/server";
import { ConsentForm } from "./components/ConsentForm";

export const metadata: Metadata = {
	title: "Authorize Application",
	description: "Grant access to your Superset account",
	robots: "noindex",
};

interface ConsentPageProps {
	searchParams: Promise<Record<string, string>>;
}

export default async function ConsentPage({ searchParams }: ConsentPageProps) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		const params = await searchParams;
		const returnUrl = `/oauth/consent?${new URLSearchParams(params).toString()}`;
		redirect(`/sign-in?redirect=${encodeURIComponent(returnUrl)}`);
	}

	const params = await searchParams;
	const { client_id, scope } = params;

	if (!client_id) {
		return (
			<div className="relative flex min-h-screen flex-col">
				<header className="container mx-auto px-6 py-6">
					<a href={env.NEXT_PUBLIC_MARKETING_URL}>
						<Image
							src="/title.svg"
							alt="Superset"
							width={140}
							height={24}
							priority
						/>
					</a>
				</header>
				<main className="flex flex-1 items-center justify-center">
					<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
						<div className="flex flex-col space-y-2 text-center">
							<h1 className="text-2xl font-semibold tracking-tight text-red-600">
								Invalid Request
							</h1>
							<p className="text-muted-foreground text-sm">
								Missing required authorization parameters.
							</p>
						</div>
					</div>
				</main>
			</div>
		);
	}

	const scopes = scope?.split(" ").filter(Boolean) ?? ["openid"];

	const trpc = await api();
	const userOrganizations = await trpc.user.myOrganizations.query();

	const oauthApp = await db.query.oauthClients.findFirst({
		where: (table, { eq }) => eq(table.clientId, client_id),
		columns: { name: true },
	});

	const extendedSession = session.session as typeof session.session & {
		activeOrganizationId?: string | null;
	};
	const defaultOrgId =
		extendedSession.activeOrganizationId ?? userOrganizations[0]?.id;

	return (
		<div className="relative flex min-h-screen flex-col">
			<header className="container mx-auto px-6 py-6">
				<a href={env.NEXT_PUBLIC_MARKETING_URL}>
					<Image
						src="/title.svg"
						alt="Superset"
						width={140}
						height={24}
						priority
					/>
				</a>
			</header>
			<main className="flex flex-1 items-center justify-center">
				<ConsentForm
					clientId={client_id}
					clientName={oauthApp?.name ?? undefined}
					scopes={scopes}
					userName={session.user.name}
					organizations={userOrganizations.map((org) => ({
						id: org.id,
						name: org.name,
					}))}
					defaultOrganizationId={defaultOrgId}
				/>
			</main>
		</div>
	);
}
