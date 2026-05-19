"use client";

import { toast } from "@superset/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string | ((params: URLSearchParams) => string)> = {
	installation_cancelled: "GitHub App installation was cancelled.",
	missing_params: "Invalid installation response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	installation_fetch_failed:
		"Failed to fetch installation details. Please try again.",
	save_failed: "Failed to save installation. Please try again.",
	installation_already_linked: (params) => {
		const account = params.get("account");
		return account
			? `This GitHub installation is already connected to another workspace (${account}). Uninstall the GitHub App from that workspace first.`
			: "This GitHub installation is already connected to another workspace. Uninstall the GitHub App from that workspace first.";
	},
	unexpected: "Something went wrong. Please try again.",
};

const WARNING_MESSAGES: Record<string, string> = {
	sync_queue_failed:
		"GitHub connected, but initial sync failed to start. Please try reconnecting.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
	github_installed: "GitHub App installed successfully!",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		const warning = searchParams.get("warning");
		const success = searchParams.get("success");

		if (error) {
			const msg = ERROR_MESSAGES[error];
			toast.error(
				typeof msg === "function"
					? msg(searchParams)
					: (msg ?? "Something went wrong."),
			);
			window.history.replaceState({}, "", "/integrations/github");
		} else if (warning) {
			toast.warning(WARNING_MESSAGES[warning] ?? "Warning occurred.");
			window.history.replaceState({}, "", "/integrations/github");
		} else if (success) {
			toast.success(SUCCESS_MESSAGES[success] ?? "Success!");
			window.history.replaceState({}, "", "/integrations/github");
		}
	}, [searchParams]);

	return null;
}
