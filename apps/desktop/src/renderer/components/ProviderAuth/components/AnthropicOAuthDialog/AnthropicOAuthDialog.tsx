import { msg } from "@lingui/core/macro";
import { OAuthDialog, type OAuthDialogProps } from "../OAuthDialog";

const ANTHROPIC_PROVIDER: OAuthDialogProps["provider"] = {
	title: msg({
		id: "components.anthropicOauthDialog.title",
		message: "Connect Anthropic",
	}),
	description: msg({
		id: "components.anthropicOauthDialog.description",
		message:
			"Approve access in your browser, then paste the callback URL or `code#state` here.",
	}),
	codeLabel: msg({
		id: "components.anthropicOauthDialog.codeLabel",
		message: "Authorization code",
	}),
	codePlaceholder: msg({
		id: "components.anthropicOauthDialog.codePlaceholder",
		message: "Paste callback URL or code#state",
	}),
	codeHint: msg({
		id: "components.anthropicOauthDialog.codeHint",
		message:
			"Anthropic usually returns a full callback URL. Pasting either format works.",
	}),
	preparingLabel: msg({
		id: "components.anthropicOauthDialog.preparingLabel",
		message: "Preparing Anthropic browser login...",
	}),
};

type AnthropicOAuthDialogProps = Omit<OAuthDialogProps, "provider">;

export function AnthropicOAuthDialog(props: AnthropicOAuthDialogProps) {
	return (
		<OAuthDialog
			{...props}
			provider={ANTHROPIC_PROVIDER}
			requireCodeForSubmit
		/>
	);
}
