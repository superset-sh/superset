"use client";

import { Trans } from "@lingui/react/macro";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function PluginDeepLinkPage() {
	const params = useParams<{ plugin: string }>();
	const plugin = encodeURIComponent(params.plugin);
	const [deepLink, setDeepLink] = useState(`superset://plugins/${plugin}`);

	useEffect(() => {
		const target = `superset://plugins/${plugin}${window.location.search}`;
		setDeepLink(target);
		window.location.href = target;
	}, [plugin]);

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
					<Trans>Redirecting to desktop app...</Trans>
				</p>
				<Link
					href={deepLink}
					className="text-sm text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
				>
					<Trans>Click here if not redirected</Trans>
				</Link>
			</div>
		</div>
	);
}
