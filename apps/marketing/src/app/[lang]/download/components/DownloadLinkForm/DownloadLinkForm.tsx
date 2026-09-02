"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { HiMiniArrowRight, HiMiniCheck } from "react-icons/hi2";
import { track } from "@/lib/analytics";
import { sendDownloadLink } from "./actions";

export function DownloadLinkForm() {
	const { t } = useLingui();
	const [email, setEmail] = useState("");
	const [submittedEmail, setSubmittedEmail] = useState("");
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (isSubmitting) return;
		const formData = new FormData(event.currentTarget);
		const honeypot = String(formData.get("company-website") ?? "");

		setError("");
		setIsSubmitting(true);
		try {
			const result = await sendDownloadLink({ email, honeypot });
			if (!result.success) {
				setError(result.error);
				return;
			}

			setSubmittedEmail(email);
			track("download_link_emailed", { platform: "mobile" });
		} catch {
			setError(
				t({
					message: "Something went wrong. Please try again.",
				}),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (submittedEmail) {
		return (
			<div className="border-l-2 border-brand pl-4" aria-live="polite">
				<div className="flex items-center gap-2 text-foreground">
					<HiMiniCheck className="size-5 text-brand" />
					<p className="font-medium">
						<Trans>Check your inbox</Trans>
					</p>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					<Trans>We sent the download link to {submittedEmail}.</Trans>
				</p>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="w-full max-w-md">
			<label
				htmlFor="download-email"
				className="mb-2 block font-mono text-xs uppercase tracking-wider text-muted-foreground"
			>
				<Trans>Email address</Trans>
			</label>
			<div className="flex flex-col gap-2 sm:flex-row sm:gap-0">
				<input
					id="download-email"
					type="email"
					name="email"
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
					disabled={isSubmitting}
					className="group flex shrink-0 items-center justify-center gap-2 bg-foreground px-5 py-3 text-sm font-normal text-background transition-colors hover:bg-brand hover:text-white disabled:cursor-wait disabled:opacity-60"
				>
					{isSubmitting ? (
						<Trans>Sending…</Trans>
					) : (
						<Trans>Email me the link</Trans>
					)}
					<HiMiniArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
				</button>
			</div>

			<input
				type="text"
				name="company-website"
				tabIndex={-1}
				autoComplete="off"
				className="hidden"
				aria-hidden="true"
			/>

			<p className="mt-3 text-xs text-muted-foreground">
				<Trans>We&apos;ll only use this to send your download link.</Trans>
			</p>
			{error ? (
				<p className="mt-2 text-sm text-red-500" role="alert">
					{error}
				</p>
			) : null}
		</form>
	);
}
