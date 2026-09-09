import { useLingui } from "@lingui/react/macro";

/**
 * How an auth method is named in the UI. Shared so the Information row and
 * the connections panel cannot drift into naming the same method differently.
 */
export function useAuthMethodLabel(): (type: string) => string {
	const { t } = useLingui();
	return (type: string) => {
		if (type === "oauth2") return t({ message: "OAuth 2.0" });
		if (type === "api_key") return t({ message: "API key" });
		return type;
	};
}
