"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

export function DesktopRedirect({
	url,
	localCallbackUrl,
}: {
	url: string;
	localCallbackUrl?: string;
}) {
	useEffect(() => {
		if (localCallbackUrl) {
			// Full-page redirect to localhost — not blocked by mixed content.
			// Browsers only block mixed-content subresources (fetch, XHR), not navigations.
			window.location.href = localCallbackUrl;
		} else {
			// Fallback to deep link (macOS, or when local server unavailable)
			window.location.href = url;
		}
	}, [url, localCallbackUrl]);

	return (
		<div className="flex flex-col items-center gap-6">
			<Image src="/title.svg" alt="Superset" width={280} height={86} priority />
			<p className="text-xl text-muted-foreground">
				Redirecting to desktop app...
			</p>
			<Link
				href={localCallbackUrl ?? url}
				className="text-sm text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
			>
				Click here if not redirected
			</Link>
		</div>
	);
}
