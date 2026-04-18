"use client";

import { useState } from "react";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";

export function CTASection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<section className="relative py-32 px-8 lg:px-[30px] mc-stone-bg overflow-hidden">
				{/* Warm gold glow */}
				<div
					className="absolute inset-0 flex items-center justify-center pointer-events-none"
					aria-hidden="true"
				>
					<div
						className="w-[500px] h-[500px] opacity-15"
						style={{
							background:
								"radial-gradient(circle, #FCDC5F 0%, #b8860b 30%, transparent 65%)",
						}}
					/>
				</div>

				<div className="relative max-w-7xl mx-auto flex flex-col items-center text-center">
					<h2
						className="text-[32px] lg:text-[48px] font-normal tracking-normal leading-[1.3em] text-foreground mb-3"
						style={{
							fontFamily: "var(--font-geist-pixel-grid)",
							textShadow:
								"0 0 20px rgba(252, 220, 95, 0.3), 2px 2px 0 rgba(0,0,0,0.5)",
						}}
					>
						Get Superset Today
					</h2>
					<p
						className="text-muted-foreground mb-8 text-sm"
						style={{ fontFamily: "var(--font-geist-pixel-square)" }}
					>
						Free and open source. Start building now.
					</p>
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
