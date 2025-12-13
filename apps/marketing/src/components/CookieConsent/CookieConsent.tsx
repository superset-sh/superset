"use client";

import { ANALYTICS_CONSENT_KEY } from "@superset/shared/constants";
import { AnimatePresence, motion } from "framer-motion";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

export function CookieConsent() {
	const [showBanner, setShowBanner] = useState(false);

	useEffect(() => {
		const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		if (consent === null) {
			setShowBanner(true);
		}
	}, []);

	const handleAccept = () => {
		localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
		posthog.opt_in_capturing();
		setShowBanner(false);
	};

	const handleDecline = () => {
		localStorage.setItem(ANALYTICS_CONSENT_KEY, "declined");
		setShowBanner(false);
	};

	return (
		<AnimatePresence>
			{showBanner && (
				<div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:p-6">
					<motion.div
						initial={{ y: 100, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 100, opacity: 0 }}
						transition={{ type: "spring", damping: 25, stiffness: 300 }}
						className="pointer-events-auto w-full max-w-7xl"
					>
						<div className="relative rounded-2xl border border-border bg-background p-4 shadow-xl sm:p-6">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="pr-8 sm:pr-0">
									<p className="text-sm text-muted-foreground">
										We use cookies to analyze site usage and improve your
										experience. If you're not okay with this, declining will
										ensure you aren't tracked other than for essential site
										functionality (i.e. logging in).
									</p>
								</div>
								<div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
									<button
										type="button"
										onClick={handleDecline}
										className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
									>
										Decline
									</button>
									<button
										type="button"
										onClick={handleAccept}
										className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
									>
										Accept
									</button>
								</div>
							</div>
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
