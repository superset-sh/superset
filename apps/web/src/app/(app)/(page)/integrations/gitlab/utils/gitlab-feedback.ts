import { msg } from "@lingui/core/macro";

export function gitlabErrorMessage(code: string) {
	switch (code) {
		case "oauth_not_configured":
			return msg({
				message:
					"GitLab OAuth is not configured on the API server. Contact your administrator or use a token.",
			});
		case "host_not_allowed":
			return msg({
				message:
					"The GitLab host is not allowed. OAuth must use the server's registered GitLab host; tokens require an approved HTTPS host.",
			});
		case "token_rejected":
			return msg({
				message:
					"The GitLab token was rejected. Check its expiry and api and read_repository scopes, then reconnect.",
			});
		case "provider_unavailable":
			return msg({ message: "Could not reach the provider. Try again." });
		case "path_not_found":
			return msg({
				message:
					"The GitLab project or group was not found or is not accessible. Enter its full path, including any subgroups.",
			});
		case "already_connected":
			return msg({
				message:
					"This GitLab project or group is already connected to another Superset organization. Disconnect it there before reconnecting.",
			});
		case "hook_failed":
			return msg({
				message:
					"GitLab webhook setup failed. Check the connection and webhook permissions, then refresh webhooks.",
			});
		case "disconnect_failed":
			return msg({
				message:
					"GitLab was disconnected locally, but remote webhook or token cleanup failed. Review the remaining access in GitLab.",
			});
		case "sign_in":
			return msg({
				message:
					"Sign in as an organization admin or owner to manage this connection.",
			});
		case "unauthorized":
			return msg({ message: "You are not authorized to perform this action." });
		case "oauth_denied":
			return msg({
				message: "GitLab authorization was cancelled. Please try again.",
			});
		case "invalid_state":
			return msg({
				message:
					"The GitLab authorization session is invalid or expired. Please try again.",
			});
		case "missing_params":
			return msg({
				message:
					"The GitLab authorization response is incomplete. Please try again.",
			});
		default:
			return msg({ message: "Something went wrong. Please try again." });
	}
}
