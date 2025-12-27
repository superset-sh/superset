import { auth } from "@clerk/nextjs/server";
import { DOWNLOAD_URL_MAC_ARM64 } from "@superset/shared/constants";
import { Download } from "lucide-react";

import { env } from "@/env";

export async function CTAButtons() {
	const { userId } = await auth();

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
					href={DOWNLOAD_URL_MAC_ARM64}
					className="px-4 py-2 text-sm font-normal bg-foreground text-background hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
				>
					Download for macOS
					<Download className="size-4" aria-hidden="true" />
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
				href={DOWNLOAD_URL_MAC_ARM64}
				className="px-4 py-2 text-sm font-normal bg-foreground text-background hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
			>
				Download for macOS
				<Download className="size-4" aria-hidden="true" />
			</a>
		</>
	);
}
