"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export function DesktopRedirect({
	url,
	localCallbackUrl,
}: {
	url: string;
	localCallbackUrl?: string;
}) {
	const [status, setStatus] = useState<"redirecting" | "connected">(
		"redirecting",
	);

	useEffect(() => {
		let isCancelled = false;

		const runRedirect = async () => {
			if (localCallbackUrl) {
				for (let attempt = 0; attempt < 6; attempt++) {
					try {
						const response = await fetch(localCallbackUrl, {
							method: "GET",
							credentials: "omit",
						});
						if (response.ok && !isCancelled) {
							setStatus("connected");
							return;
						}
					} catch {
						// Retry shortly in case desktop server is still initializing.
					}
					await new Promise((resolve) => window.setTimeout(resolve, 250));
					if (isCancelled) return;
				}

				// If localhost callback cannot be reached, fall back to URI scheme.
				if (!isCancelled) {
					window.location.href = url;
					return;
				}
			} else if (!isCancelled) {
				window.location.href = url;
				return;
			}
		};

		void runRedirect();

		return () => {
			isCancelled = true;
		};
	}, [url, localCallbackUrl]);

	if (status === "connected") {
		return (
			<div className="flex flex-col items-center gap-6">
				<Image
					src="/title.svg"
					alt="Superset"
					width={280}
					height={86}
					priority
				/>
				<p className="text-xl text-muted-foreground">Signed in successfully.</p>
				<p className="text-sm text-muted-foreground/70 text-center">
					You can return to the desktop app now.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center gap-6">
			<Image src="/title.svg" alt="Superset" width={280} height={86} priority />
			<p className="text-xl text-muted-foreground">
				Redirecting to desktop app...
			</p>
			<Link
				href={url}
				className="text-sm text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
			>
				Click here if not redirected
			</Link>
			{localCallbackUrl ? (
				<p className="text-xs text-muted-foreground/60 text-center">
					If this page stays open, return to the desktop app manually.
				</p>
			) : null}
		</div>
	);
}
