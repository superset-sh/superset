"use client";

import { toast } from "@superset/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	oauth_denied: "Authorization was denied. Please try again.",
	missing_params: "Invalid OAuth response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	token_exchange_failed: "Failed to connect to Linear. Please try again.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		if (!error) return;

		const message =
			error === "workspace_already_linked"
				? searchParams.get("owner")
					? `This Linear workspace is already connected by ${searchParams.get("owner")}. Ask them to disconnect first.`
					: "This Linear workspace is already connected by another Superset organization."
				: (ERROR_MESSAGES[error] ?? "Something went wrong.");

		window.history.replaceState({}, "", "/integrations/linear");
		const id = setTimeout(() => toast.error(message), 0);
		return () => clearTimeout(id);
	}, [searchParams]);

	return null;
}
