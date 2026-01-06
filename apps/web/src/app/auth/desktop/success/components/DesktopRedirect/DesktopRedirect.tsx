"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

export function DesktopRedirect({ url }: { url: string }) {
	useEffect(() => {
		window.location.href = url;
	}, [url]);

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
		</div>
	);
}
