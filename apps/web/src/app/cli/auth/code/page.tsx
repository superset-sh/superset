import Image from "next/image";

import { env } from "@/env";
import { CliAuthCodeDisplay } from "./components/CliAuthCodeDisplay";

interface CliAuthCodePageProps {
	searchParams: Promise<Record<string, string>>;
}

export default async function CliAuthCodePage({
	searchParams,
}: CliAuthCodePageProps) {
	const params = await searchParams;
	const code = params.code;
	const state = params.state;
	const oauthError = params.error;

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
				{oauthError ? (
					<div className="mx-auto flex w-full max-w-md flex-col items-center space-y-3 text-center">
						<h1 className="text-2xl font-semibold tracking-tight text-destructive">
							Authorization failed
						</h1>
						<p className="text-muted-foreground text-sm">
							{params.error_description ?? oauthError}
						</p>
					</div>
				) : code && state ? (
					<CliAuthCodeDisplay code={code} state={state} />
				) : (
					<p className="text-muted-foreground">
						Missing authorization code. Re-run <code>superset auth login</code>.
					</p>
				)}
			</main>
		</div>
	);
}
