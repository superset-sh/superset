import { auth } from "@clerk/nextjs/server";
import { Download } from "lucide-react";

import { env } from "@/env";

export async function AuthButtons() {
	const { userId } = await auth();

	if (userId) {
		return (
			<div className="flex items-center gap-3">
				<a
					href={env.NEXT_PUBLIC_WEB_URL}
					className="px-4 py-2 text-sm font-normal text-neutral-300 hover:text-white transition-colors"
				>
					Dashboard
				</a>
				<a
					href={env.NEXT_PUBLIC_WEB_URL}
					className="px-4 py-2 text-sm font-normal bg-white text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center gap-2"
				>
					Download for macOS
					<Download className="size-4" />
				</a>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-3">
			<a
				href={`${env.NEXT_PUBLIC_WEB_URL}/sign-in`}
				className="px-4 py-2 text-sm font-normal text-neutral-300 hover:text-white transition-colors"
			>
				Sign In
			</a>
			<a
				href={`${env.NEXT_PUBLIC_WEB_URL}/sign-up`}
				className="px-4 py-2 text-sm font-normal bg-white text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center gap-2"
			>
				Download for macOS
				<Download className="size-4" />
			</a>
		</div>
	);
}
