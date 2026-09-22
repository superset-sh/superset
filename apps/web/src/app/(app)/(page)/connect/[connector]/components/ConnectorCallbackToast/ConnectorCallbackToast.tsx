"use client";

import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

interface ConnectorCallbackToastProps {
	slug: string;
	plugin: string;
}

/**
 * Reports what the connector callback redirected back with.
 *
 * The API sends every connector here, so this replaces the seven per-provider
 * handlers for anything in the registry. Messages are the ones the plugin
 * detail page already uses, keyed the same way, so the two surfaces say the
 * same thing about the same failure.
 */
export function ConnectorCallbackToast({
	slug,
	plugin,
}: ConnectorCallbackToastProps) {
	const { t } = useLingui();
	const router = useRouter();
	const params = useSearchParams();
	const connected = params.get("connected");
	const error = params.get("error");
	const owner = params.get("owner");

	useEffect(() => {
		if (!connected && !error) return;

		if (connected) {
			// `label` keeps this the same message the plugin detail page shows.
			const label = plugin;
			toast.success(t({ message: `Connected ${label}` }));
		} else if (error === "oauth_denied") {
			toast.error(
				t({ message: `You declined the ${plugin} authorization request.` }),
			);
		} else if (error === "invalid_state") {
			toast.error(
				t({
					message: `That ${plugin} sign-in link expired. Try connecting again.`,
				}),
			);
		} else if (error === "not_configured") {
			toast.error(
				t({
					message: `${plugin} has no OAuth client configured on this deployment yet.`,
				}),
			);
		} else if (error === "account_already_linked") {
			toast.error(
				owner
					? t({
							message: `This ${plugin} account is already connected by ${owner}. Ask them to disconnect first.`,
						})
					: t({
							message: `This ${plugin} account is already connected by another Superset organization.`,
						}),
			);
		} else {
			toast.error(t({ message: `Could not connect ${plugin}. Try again.` }));
		}

		// The toast has fired; a refresh or a back-and-forward must not repeat it.
		router.replace(`/connect/${slug}`);
	}, [connected, error, owner, slug, plugin, router, t]);

	return null;
}
