"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Deep link passthrough page for tasks.
 * Attempts to open the Superset desktop app, falls back to dashboard.
 */
export default function TaskDeepLinkPage() {
	const params = useParams<{ slug: string }>();
	const slug = params.slug;
	const deepLink = `superset://tasks/${slug}`;

	useEffect(() => {
		window.location.href = deepLink;
	}, [deepLink]);

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
			<div className="flex flex-col items-center gap-6">
				<Image
					src="/title.svg"
					alt="Superset"
					width={280}
					height={86}
					priority
				/>
				<p className="text-xl text-muted-foreground">
					Redirecting to desktop app...
				</p>
				<Link
					href={deepLink}
					className="text-sm text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
				>
					Click here if not redirected
				</Link>
			</div>
		</div>
	);
}
