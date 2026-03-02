"use client";

import { useState } from "react";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";

export function CTASection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<section className="relative py-32 px-8 lg:px-[30px]">
				<div className="max-w-7xl mx-auto flex flex-col items-center text-center">
					<h2
						className="text-[32px] lg:text-[40px] font-normal tracking-normal leading-[1.3em] text-foreground mb-8"
						style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
					>
						Get Superset Today
					</h2>
					<div>
						<DownloadButton onJoinWaitlist={() => setIsWaitlistOpen(true)} />
					</div>
				</div>
			</section>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
