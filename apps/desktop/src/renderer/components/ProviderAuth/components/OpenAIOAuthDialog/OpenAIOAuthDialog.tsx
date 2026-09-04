import { msg } from "@lingui/core/macro";
import { OAuthDialog, type OAuthDialogProps } from "../OAuthDialog";

const OPENAI_PROVIDER: OAuthDialogProps["provider"] = {
	title: msg({
		message: "Connect OpenAI",
	}),
	description: msg({
		message:
			"Approve access in your browser. If the callback does not finish, paste the redirected callback URL below.",
	}),
	codeLabel: msg({
		message: "Callback URL (optional)",
	}),
	codePlaceholder: msg({
		message: "Paste callback URL",
	}),
	codeHint: msg({
		message: "Leave this empty if browser login finishes on its own.",
	}),
	preparingLabel: msg({
		message: "Preparing OpenAI browser login...",
	}),
};

type OpenAIOAuthDialogProps = Omit<OAuthDialogProps, "provider">;

export function OpenAIOAuthDialog(props: OpenAIOAuthDialogProps) {
	return <OAuthDialog {...props} provider={OPENAI_PROVIDER} />;
}
