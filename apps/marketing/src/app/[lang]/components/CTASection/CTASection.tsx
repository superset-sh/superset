"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { InstallCommand } from "./components/InstallCommand";

export function CTASection() {
	const { t } = useLingui();
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<section className="relative py-24 sm:py-32">
				<div className="max-w-7xl mx-auto px-6 sm:px-8 flex flex-col items-center text-center">
					<h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight leading-[1.1] text-foreground mb-8">
						<Trans>Bring your agents together.</Trans>
					</h2>
					<div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
						<DownloadButton onJoinWaitlist={() => setIsWaitlistOpen(true)} />
						<button
							type="button"
							className="px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal bg-background border border-border text-foreground hover:bg-muted transition-colors flex items-center gap-2"
							onClick={() => window.open(COMPANY.GITHUB_URL, "_blank")}
							aria-label={t({
								message: "Star on GitHub",
							})}
						>
							<Trans>Star on GitHub</Trans>
							<FaGithub className="size-4" />
						</button>
					</div>
					<p className="mt-10 mb-4 text-sm text-muted-foreground">
						<Trans>Or ask your coding agent to install the Superset CLI.</Trans>
					</p>
					<InstallCommand />
				</div>
			</section>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
