import { OAuthDialog, type OAuthDialogProps } from "../OAuthDialog";

const ANTHROPIC_PROVIDER: OAuthDialogProps["provider"] = {
	title: "Connect Anthropic",
	description:
		"Approve access in your browser, then paste the callback URL or `code#state` here.",
	codeLabel: "Authorization code",
	codePlaceholder: "Paste callback URL or code#state",
	codeHint:
		"Anthropic usually returns a full callback URL. Pasting either format works.",
	preparingLabel: "Preparing Anthropic browser login...",
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
