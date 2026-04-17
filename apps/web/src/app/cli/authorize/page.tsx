import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";

import { env } from "@/env";
import { api } from "@/trpc/server";
import { CliAuthorizeForm } from "./components/CliAuthorizeForm";

interface CliAuthorizePageProps {
	searchParams: Promise<Record<string, string>>;
}

export default async function CliAuthorizePage({
	searchParams,
}: CliAuthorizePageProps) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	const params = await searchParams;

	if (!session) {
		const returnUrl = `/cli/authorize?${new URLSearchParams(params).toString()}`;
		redirect(`/sign-in?redirect=${encodeURIComponent(returnUrl)}`);
	}

	const { state, redirect_uri } = params;

	if (!state || !redirect_uri) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-muted-foreground">
					Missing required parameters. Use <code>superset auth login</code>.
				</p>
			</div>
		);
	}

	if (
		!redirect_uri.startsWith("http://127.0.0.1:") &&
		!redirect_uri.startsWith("http://localhost:")
	) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-destructive">
					Invalid redirect_uri — only loopback addresses are allowed.
				</p>
			</div>
		);
	}

	const trpc = await api();
	const organizations = await trpc.user.myOrganizations.query();

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
				<CliAuthorizeForm
					state={state}
					redirectUri={redirect_uri}
					userName={session.user.name}
					organizations={organizations.map((organization) => ({
						id: organization.id,
						name: organization.name,
					}))}
					apiUrl={env.NEXT_PUBLIC_API_URL}
				/>
			</main>
		</div>
	);
}
