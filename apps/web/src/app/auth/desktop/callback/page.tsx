"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

const DESKTOP_PROTOCOL =
	process.env.NODE_ENV === "development" ? "superset-dev" : "superset";

function CallbackContent() {
	const searchParams = useSearchParams();
	const code = searchParams.get("code");
	const state = searchParams.get("state");
	const error = searchParams.get("error");

	const [hasAttempted, setHasAttempted] = useState(false);

	const desktopUrl =
		code && state
			? `${DESKTOP_PROTOCOL}://auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
			: null;

	const openDesktopApp = useCallback(() => {
		if (!desktopUrl) return;
		window.location.href = desktopUrl;
	}, [desktopUrl]);

	useEffect(() => {
		if (error || !code) return;

		if (!hasAttempted) {
			setHasAttempted(true);
			openDesktopApp();
		}
	}, [code, error, hasAttempted, openDesktopApp]);

	if (error) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
				<div className="flex flex-col items-center gap-6">
					<Image
						src="/title.svg"
						alt="Superset"
						width={140}
						height={43}
						priority
					/>
					<p className="text-xl text-muted-foreground">Authentication failed</p>
					<p className="text-muted-foreground/70">{error}</p>
				</div>
			</div>
		);
	}

	if (!code || !state) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
				<div className="flex flex-col items-center gap-6">
					<Image
						src="/title.svg"
						alt="Superset"
						width={140}
						height={43}
						priority
					/>
					<p className="text-xl text-muted-foreground">Invalid request</p>
					<p className="text-muted-foreground/70">
						Missing authentication parameters. Please try again.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<div className="flex flex-col items-center">
				<Image
					src="/title.svg"
					alt="Superset"
					width={280}
					height={86}
					priority
				/>
				<p className="text-xl text-muted-foreground">
					Redirecting to the desktop app...
				</p>
				<div className="flex flex-col items-center gap-2">
					<Link
						href={desktopUrl as string}
						className="text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
					>
						If you weren&apos;t redirected, click here.
					</Link>
				</div>
			</div>
		</div>
	);
}

export default function DesktopCallbackPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
					<div className="flex flex-col items-center gap-6">
						<Image
							src="/title.svg"
							alt="Superset"
							width={140}
							height={43}
							priority
						/>
						<p className="text-xl text-muted-foreground">Loading...</p>
					</div>
				</div>
			}
		>
			<CallbackContent />
		</Suspense>
	);
}
