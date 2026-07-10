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
					<h2 className="text-3xl sm:text-4xl xl:text-5xl font-medium tracking-tight leading-[1.1] text-foreground mb-8">
						Try Superset now.
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
