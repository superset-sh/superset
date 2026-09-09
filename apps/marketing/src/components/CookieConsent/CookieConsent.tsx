"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { AnimatePresence, m } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import { withPosthog } from "@/lib/analytics/lazy";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

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
		setShowBanner(false);
		withPosthog((posthog) => posthog.opt_in_capturing());
	};

	const handleOptOut = () => {
		localStorage.setItem(ANALYTICS_CONSENT_KEY, "declined");
		withPosthog((posthog) => posthog.opt_out_capturing());
		setShowBanner(false);
	};

	return (
		<AnimatePresence>
			{showBanner && (
				<m.div
					initial={{ y: 20, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: 20, opacity: 0 }}
					transition={{ type: "spring", damping: 25, stiffness: 300 }}
					className="fixed bottom-4 left-4 z-50 max-w-xs rounded-lg border border-border bg-card p-4 shadow-lg"
				>
					<p className="text-sm text-muted-foreground">
						<Trans>
							We only collect analytics cookies so we can improve your
							experience.
						</Trans>
					</p>
					<div className="mt-3 flex items-center justify-between">
						<Button variant="link" asChild className="px-0">
							<Link href="/privacy">
								<Trans>Privacy policy</Trans>
							</Link>
						</Button>
						<div className="flex items-center gap-2">
							<Button variant="outline" onClick={handleOptOut}>
								<Trans>Opt-out</Trans>
							</Button>
							<Button variant="outline" onClick={handleAccept}>
								<Trans>Accept</Trans>
							</Button>
						</div>
					</div>
				</m.div>
			)}
		</AnimatePresence>
	);
}
