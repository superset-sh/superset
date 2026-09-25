"use client";

import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { HiMiniArrowRight, HiMiniCheck } from "react-icons/hi2";
import { track } from "@/lib/analytics";
import { withPosthog } from "@/lib/analytics/lazy";

interface MobileWaitlistProps {
	platform: "ios" | "android";
}

export function MobileWaitlist({ platform }: MobileWaitlistProps) {
	const [email, setEmail] = useState("");
	const [isSubmitted, setIsSubmitted] = useState(false);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!email) return;

		withPosthog((posthog) => {
			const wasOptedOut = posthog.has_opted_out_capturing();
			if (wasOptedOut) posthog.opt_in_capturing();
			track("waitlist_signup", { email, platform });
			if (wasOptedOut) posthog.opt_out_capturing();
		});
		setIsSubmitted(true);
	}

	if (isSubmitted) {
		return (
			<div className="border-brand border-l-2 pl-4" aria-live="polite">
				<p className="flex items-center gap-2 font-medium text-foreground">
					<HiMiniCheck className="size-5 text-brand" />
					<Trans>You're on the list!</Trans>
				</p>
				{platform === "android" ? (
					<p className="mt-1 text-muted-foreground text-sm">
						<Trans>We'll email you when Superset for Android is ready.</Trans>
					</p>
				) : null}
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="w-full max-w-md">
			<label htmlFor="mobile-waitlist-email" className="sr-only">
				<Trans>Email address</Trans>
			</label>
			<div className="flex flex-col gap-2 sm:flex-row sm:gap-0">
				<input
					id="mobile-waitlist-email"
					type="email"
					required
					autoComplete="email"
					inputMode="email"
					placeholder="you@company.com"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					className="min-w-0 flex-1 border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-foreground focus:outline-none sm:border-r-0"
				/>
				<button
					type="submit"
					className="group flex shrink-0 items-center justify-center gap-2 bg-foreground px-5 py-3 font-normal text-background text-sm transition-colors hover:bg-brand hover:text-white"
				>
					<Trans>Join waitlist</Trans>
					<HiMiniArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
				</button>
			</div>
		</form>
	);
}
