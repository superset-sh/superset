"use client";

import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { useState } from "react";
import { DownloadButton } from "@/app/[lang]/components/DownloadButton";
import { WaitlistModal } from "@/app/[lang]/components/WaitlistModal";

interface ProductHeroActionsProps {
	source: "pages" | "automations" | "browser" | "plugins";
	docsPath: string;
}

export function ProductHeroActions({
	source,
	docsPath,
}: ProductHeroActionsProps) {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<div className="mt-8 flex flex-wrap items-center gap-3">
				<DownloadButton
					source={source}
					onJoinWaitlist={() => setIsWaitlistOpen(true)}
				/>
				<a
					href={`${COMPANY.DOCS_URL}${docsPath}`}
					className="border border-border px-6 py-3 text-foreground transition-colors hover:bg-muted"
				>
					<Trans>Read the docs</Trans>
				</a>
			</div>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
