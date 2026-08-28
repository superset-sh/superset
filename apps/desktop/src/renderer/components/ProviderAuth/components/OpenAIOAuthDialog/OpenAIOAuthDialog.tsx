import { msg } from "@lingui/core/macro";
import { OAuthDialog, type OAuthDialogProps } from "../OAuthDialog";

const OPENAI_PROVIDER: OAuthDialogProps["provider"] = {
	title: msg({
		id: "components.openaiOauthDialog.title",
		message: "Connect OpenAI",
	}),
	description: msg({
		id: "components.openaiOauthDialog.description",
		message:
			"Approve access in your browser. If the callback does not finish, paste the redirected callback URL below.",
	}),
	codeLabel: msg({
		id: "components.openaiOauthDialog.codeLabel",
		message: "Callback URL (optional)",
	}),
	codePlaceholder: msg({
		id: "components.openaiOauthDialog.codePlaceholder",
		message: "Paste callback URL",
	}),
	codeHint: msg({
		id: "components.openaiOauthDialog.codeHint",
		message: "Leave this empty if browser login finishes on its own.",
	}),
	preparingLabel: msg({
		id: "components.openaiOauthDialog.preparingLabel",
		message: "Preparing OpenAI browser login...",
	}),
};

type OpenAIOAuthDialogProps = Omit<OAuthDialogProps, "provider">;

export function OpenAIOAuthDialog(props: OpenAIOAuthDialogProps) {
	return <OAuthDialog {...props} provider={OPENAI_PROVIDER} />;
}
