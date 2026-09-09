"use client";

import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { toast } from "@superset/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Every query param each provider's API callback can redirect back with. Kept
 * in sync with apps/api/src/app/api/github/callback and
 * apps/api/src/app/api/integrations/<provider>/{connect,callback}: a callback
 * emitting a key that has no message is a compile error in the page that
 * renders this handler.
 */
type CallbackKeys = {
	github: {
		error:
			| "already_connected"
			| "installation_cancelled"
			| "installation_fetch_failed"
			| "invalid_state"
			| "missing_params"
			| "save_failed"
			| "unauthorized"
			| "unexpected";
		warning: "sync_queue_failed";
		success: "github_installed";
	};
	google: {
		error:
			| "invalid_state"
			| "missing_params"
			| "missing_scopes"
			| "no_refresh_token"
			| "oauth_denied"
			| "token_exchange_failed"
			| "unauthorized"
			| "userinfo_failed";
	};
	linear: {
		error:
			| "invalid_state"
			| "missing_params"
			| "oauth_denied"
			| "token_exchange_failed"
			| "unauthorized";
		warning: "sync_queued_failed";
	};
	"microsoft-teams": {
		error:
			| "identity_denied"
			| "identity_failed"
			| "invalid_state"
			| "missing_params"
			| "oauth_denied"
			| "subscription_failed"
			| "tenant_already_linked"
			| "token_exchange_failed"
			| "unauthorized";
	};
	notion: {
		error:
			| "invalid_state"
			| "missing_params"
			| "not_configured"
			| "oauth_denied"
			| "token_exchange_failed"
			| "unauthorized";
	};
	sentry: {
		error:
			| "invalid_state"
			| "missing_params"
			| "not_configured"
			| "oauth_denied"
			| "organization_already_linked"
			| "organization_lookup_failed"
			| "token_exchange_failed"
			| "unauthorized";
	};
	slack: {
		error:
			| "invalid_state"
			| "missing_params"
			| "oauth_denied"
			| "slack_api_error"
			| "token_exchange_failed"
			| "unauthorized"
			| "workspace_already_linked";
	};
};

type Provider = keyof CallbackKeys;

/**
 * A plain message, or one that varies on a companion query param the callback
 * sends alongside the key (Slack's `owner`, Teams' `detail`). Kept
 * serializable so server pages can pass it to this client component.
 * `{param}` in `withParam` is replaced by the param's value.
 */
export type CallbackMessage =
	| string
	| { param: string; withParam: string; withoutParam: string };

type KeysOf<P extends Provider, Kind extends string> =
	CallbackKeys[P] extends Record<Kind, infer K extends string> ? K : never;

type IntegrationErrorHandlerProps<P extends Provider> = {
	provider: P;
	messages: Record<KeysOf<P, "error">, CallbackMessage>;
} & (KeysOf<P, "warning"> extends never
	? { warnings?: undefined }
	: { warnings: Record<KeysOf<P, "warning">, string> }) &
	(KeysOf<P, "success"> extends never
		? { successes?: undefined }
		: { successes: Record<KeysOf<P, "success">, string> });

function resolveMessage(
	message: CallbackMessage | undefined,
	params: URLSearchParams,
): string {
	if (message === undefined)
		return i18n._(
			msg({
				message: "Something went wrong.",
			}),
		);
	if (typeof message === "string") return message;
	const value = params.get(message.param);
	return value
		? message.withParam.replace(`{${message.param}}`, value)
		: message.withoutParam;
}

export function IntegrationErrorHandler<P extends Provider>({
	provider,
	messages,
	warnings,
	successes,
}: IntegrationErrorHandlerProps<P>) {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		const warning = searchParams.get("warning");
		const success = searchParams.get("success");
		if (!error && !warning && !success) return;

		// Toast first: replacing the URL re-runs this effect through Next's
		// patched history, and a deferred toast can be cleaned up before it shows.
		if (error) {
			const message = (messages as Record<string, CallbackMessage>)[error];
			toast.error(resolveMessage(message, searchParams));
		} else if (warning) {
			toast.warning(
				(warnings as Record<string, string> | undefined)?.[warning] ??
					i18n._(
						msg({
							message: "Warning occurred.",
						}),
					),
			);
		} else if (success) {
			toast.success(
				(successes as Record<string, string> | undefined)?.[success] ??
					i18n._(
						msg({
							message: "Success!",
						}),
					),
			);
		}
		window.history.replaceState({}, "", `/integrations/${provider}`);
	}, [searchParams, provider, messages, warnings, successes]);

	return null;
}
