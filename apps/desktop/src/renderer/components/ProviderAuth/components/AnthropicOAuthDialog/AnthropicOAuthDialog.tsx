import { msg } from "@lingui/core/macro";
import { OAuthDialog, type OAuthDialogProps } from "../OAuthDialog";

const ANTHROPIC_PROVIDER: OAuthDialogProps["provider"] = {
	title: msg({
		message: "Connect Anthropic",
	}),
	description: msg({
		message:
			"Approve access in your browser, then paste the callback URL or `code#state` here.",
	}),
	codeLabel: msg({
		message: "Authorization code",
	}),
	codePlaceholder: msg({
		message: "Paste callback URL or code#state",
	}),
	codeHint: msg({
		message:
			"Anthropic usually returns a full callback URL. Pasting either format works.",
	}),
	preparingLabel: msg({
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
