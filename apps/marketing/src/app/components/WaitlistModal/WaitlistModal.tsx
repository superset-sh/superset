"use client";

import posthog from "posthog-js";
import { useEffect, useState } from "react";

import { track } from "@/lib/analytics";

interface WaitlistModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function WaitlistModal({ isOpen, onClose }: WaitlistModalProps) {
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "unset";
		}

		return () => {
			document.body.style.overflow = "unset";
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) {
			setEmail("");
			setSubmitted(false);
		}
	}, [isOpen]);

	if (!isOpen) return null;

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!email) return;

		const wasOptedOut = posthog.has_opted_out_capturing();
		if (wasOptedOut) {
			posthog.opt_in_capturing();
		}

		track("waitlist_signup", { email, platform: "windows_linux" });

		if (wasOptedOut) {
			posthog.opt_out_capturing();
		}

		setSubmitted(true);
	}

	return (
		<>
			<button
				type="button"
				className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 cursor-default"
				onClick={onClose}
				aria-label="Close modal backdrop"
			/>

			<div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
				<div className="pointer-events-auto w-full max-w-md mx-4 bg-background rounded-2xl shadow-2xl border border-border overflow-hidden p-8 relative">
					<button
						type="button"
						onClick={onClose}
						className="absolute top-4 right-4 z-10 text-muted-foreground hover:text-foreground transition-colors"
						aria-label="Close modal"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>

					{submitted ? (
						<div className="text-center py-4">
							<h2 className="text-xl font-medium text-foreground mb-2">
								You're on the list!
							</h2>
							<p className="text-muted-foreground text-sm">
								We'll notify you when Windows & Linux support is ready.
							</p>
						</div>
					) : (
						<>
							<h2 className="text-xl font-medium text-foreground mb-2">
								Join the waitlist
							</h2>
							<p className="text-muted-foreground text-sm mb-6">
								Get notified when Superset is available on Windows & Linux.
							</p>
							<form onSubmit={handleSubmit} className="flex flex-col gap-3">
								<input
									type="email"
									required
									placeholder="you@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								/>
								<button
									type="submit"
									className="w-full rounded-lg bg-foreground text-background font-medium py-2.5 text-sm hover:opacity-90 transition-opacity"
								>
									Join waitlist
								</button>
							</form>
						</>
					)}
				</div>
			</div>
		</>
	);
}
