import { OAuthDialog, type OAuthDialogProps } from "../OAuthDialog";

const OPENAI_PROVIDER: OAuthDialogProps["provider"] = {
	title: "Connect OpenAI",
	description:
		"Approve access in your browser. If the callback does not finish, paste the redirected callback URL below.",
	codeLabel: "Callback URL (optional)",
	codePlaceholder: "Paste callback URL",
	codeHint: "Leave this empty if browser login finishes on its own.",
	preparingLabel: "Preparing OpenAI browser login...",
};

type OpenAIOAuthDialogProps = Omit<OAuthDialogProps, "provider">;

export function OpenAIOAuthDialog(props: OpenAIOAuthDialogProps) {
	return <OAuthDialog {...props} provider={OPENAI_PROVIDER} />;
}
