import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import Image from "next/image";

import { env } from "@/env";
import { api } from "@/trpc/server";
import { CliAuthorizeForm } from "./components/CliAuthorizeForm";

interface CliAuthorizePageProps {
	searchParams: Promise<Record<string, string>>;
}

function isLoopbackRedirectUri(value: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return false;
	}
	if (parsed.protocol !== "http:") return false;
	if (parsed.username !== "" || parsed.password !== "") return false;
	return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
}

export default async function CliAuthorizePage({
	searchParams,
}: CliAuthorizePageProps) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		// Defensive — middleware should have caught this.
		return null;
	}

	const params = await searchParams;
	const state = params.state;
	const redirectUri = params.redirect_uri;

	if (!state || !redirectUri) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-muted-foreground">
					Missing required parameters. Use <code>superset auth login</code>.
				</p>
			</div>
		);
	}

	if (!isLoopbackRedirectUri(redirectUri)) {
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
					redirectUri={redirectUri}
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
