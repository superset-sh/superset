import { auth } from "@clerk/nextjs/server";
import {
	DOWNLOAD_URL_MAC_ARM64,
	WAITLIST_URL,
} from "@superset/shared/constants";
import { Clock, Download } from "lucide-react";
import { headers } from "next/headers";

import { env } from "@/env";
import { isMacOSUserAgent } from "@/lib/platform";

export async function CTAButtons() {
	const { userId } = await auth();
	const requestHeaders = await headers();
	const isMac = isMacOSUserAgent(requestHeaders.get("user-agent") ?? "");
	const primaryCtaHref = isMac ? DOWNLOAD_URL_MAC_ARM64 : WAITLIST_URL;
	const primaryCtaLabel = isMac ? "Download for macOS" : "Join waitlist";
	const PrimaryCtaIcon = isMac ? Download : Clock;

	if (userId) {
		return (
			<>
				<a
					href={env.NEXT_PUBLIC_WEB_URL}
					className="px-4 py-2 text-sm font-normal text-muted-foreground hover:text-foreground transition-colors text-center"
				>
					Dashboard
				</a>
				<a
					href={primaryCtaHref}
					className="px-4 py-2 text-sm font-normal bg-foreground text-background hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
					target={isMac ? undefined : "_blank"}
					rel={isMac ? undefined : "noopener noreferrer"}
				>
					{primaryCtaLabel}
					<PrimaryCtaIcon className="size-4" aria-hidden="true" />
				</a>
			</>
		);
	}

	return (
		<>
			<a
				href={`${env.NEXT_PUBLIC_WEB_URL}/sign-in`}
				className="px-4 py-2 text-sm font-normal text-muted-foreground hover:text-foreground transition-colors text-center"
			>
				Sign In
			</a>
			<a
				href={primaryCtaHref}
				className="px-4 py-2 text-sm font-normal bg-foreground text-background hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
				target={isMac ? undefined : "_blank"}
				rel={isMac ? undefined : "noopener noreferrer"}
			>
				{primaryCtaLabel}
				<PrimaryCtaIcon className="size-4" aria-hidden="true" />
			</a>
		</>
	);
}
