"use client";

import { toast } from "@superset/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	missing_params: "Invalid OAuth response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	missing_flow_state: "The connection flow expired. Please try again.",
	unauthorized: "You are not authorized to connect this organization.",
	not_configured: "GitLab integration is not configured on the server.",
	save_failed: "Failed to save the connection. Please try again.",
	unexpected: "Something went wrong. Please try again.",
};

const WARNING_MESSAGES: Record<string, string> = {
	sync_queue_failed:
		"GitLab connected, but initial sync failed to start. Try reconnecting.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
	gitlab_connected: "GitLab connected successfully!",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		const warning = searchParams.get("warning");
		const success = searchParams.get("success");

		if (error) {
			toast.error(ERROR_MESSAGES[error] ?? "Something went wrong.");
			window.history.replaceState({}, "", "/integrations/gitlab");
		} else if (warning) {
			toast.warning(WARNING_MESSAGES[warning] ?? "Warning occurred.");
			window.history.replaceState({}, "", "/integrations/gitlab");
		} else if (success) {
			toast.success(SUCCESS_MESSAGES[success] ?? "Success!");
			window.history.replaceState({}, "", "/integrations/gitlab");
		}
	}, [searchParams]);

	return null;
}
