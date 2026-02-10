"use client";

import { useOutlit } from "@outlit/browser/react";
import { Button } from "@superset/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

export function CookieConsent() {
	const { enableTracking, disableTracking } = useOutlit();
	const [showBanner, setShowBanner] = useState(false);

	useEffect(() => {
		const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		if (consent === null) {
			setShowBanner(true);
		}
	}, []);

	const handleAccept = () => {
		localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
		setShowBanner(false);
		posthog.opt_in_capturing();
		enableTracking();
	};

	const handleOptOut = () => {
		localStorage.setItem(ANALYTICS_CONSENT_KEY, "declined");
		posthog.opt_out_capturing();
		disableTracking();
		setShowBanner(false);
	};

	return (
		<AnimatePresence>
			{showBanner && (
				<motion.div
					initial={{ y: 20, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: 20, opacity: 0 }}
					transition={{ type: "spring", damping: 25, stiffness: 300 }}
					className="fixed bottom-4 left-4 z-50 max-w-xs rounded-lg border border-border bg-card p-4 shadow-lg"
				>
					<p className="text-sm text-muted-foreground">
						We only collect analytics cookies so we can improve your experience.
					</p>
					<div className="mt-3 flex items-center justify-between">
						<Button variant="link" asChild className="px-0">
							<Link href="/privacy">Privacy policy</Link>
						</Button>
						<div className="flex items-center gap-2">
							<Button variant="outline" onClick={handleOptOut}>
								Opt-out
							</Button>
							<Button variant="outline" onClick={handleAccept}>
								Accept
							</Button>
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
