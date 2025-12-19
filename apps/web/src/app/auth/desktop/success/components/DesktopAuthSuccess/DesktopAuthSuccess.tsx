"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const DESKTOP_PROTOCOL =
	process.env.NODE_ENV === "development" ? "superset-dev" : "superset";

export function DesktopAuthSuccess() {
	const searchParams = useSearchParams();
	const accessToken = searchParams.get("accessToken");
	const accessTokenExpiresAt = searchParams.get("accessTokenExpiresAt");
	const refreshToken = searchParams.get("refreshToken");
	const refreshTokenExpiresAt = searchParams.get("refreshTokenExpiresAt");
	const state = searchParams.get("state");
	const error = searchParams.get("error");

	const [hasAttempted, setHasAttempted] = useState(false);

	const hasAllTokens =
		accessToken &&
		accessTokenExpiresAt &&
		refreshToken &&
		refreshTokenExpiresAt &&
		state;

	const desktopUrl = hasAllTokens
		? `${DESKTOP_PROTOCOL}://auth/callback?accessToken=${encodeURIComponent(accessToken)}&accessTokenExpiresAt=${encodeURIComponent(accessTokenExpiresAt)}&refreshToken=${encodeURIComponent(refreshToken)}&refreshTokenExpiresAt=${encodeURIComponent(refreshTokenExpiresAt)}&state=${encodeURIComponent(state)}`
		: null;

	const openDesktopApp = useCallback(() => {
		if (!desktopUrl) return;
		window.location.href = desktopUrl;
	}, [desktopUrl]);

	useEffect(() => {
		if (error || !desktopUrl || hasAttempted) return;
		setHasAttempted(true);
		openDesktopApp();
	}, [error, desktopUrl, hasAttempted, openDesktopApp]);

	if (error) {
		return (
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
		);
	}

	if (!hasAllTokens) {
		return (
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
		);
	}

	return (
		<div className="flex flex-col items-center">
			<Image src="/title.svg" alt="Superset" width={280} height={86} priority />
			<p className="text-xl text-muted-foreground">
				Redirecting to the desktop app...
			</p>
			<div className="flex flex-col items-center gap-2">
				{desktopUrl && (
					<Link
						href={desktopUrl}
						className="text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
					>
						If you weren&apos;t redirected, click here.
					</Link>
				)}
			</div>
		</div>
	);
}
