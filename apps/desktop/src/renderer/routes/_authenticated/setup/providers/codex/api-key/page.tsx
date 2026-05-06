import { chatServiceTrpc } from "@superset/chat/client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { track } from "renderer/lib/analytics";
import { useOnboardingStore } from "renderer/stores/onboarding";
import { ApiKeyForm } from "../../components/ApiKeyForm";

export const Route = createFileRoute(
	"/_authenticated/setup/providers/codex/api-key/",
)({
	component: OpenAIApiKeyPage,
});

function OpenAIApiKeyPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);
	const setMutation = chatServiceTrpc.auth.setOpenAIApiKey.useMutation();

	useEffect(() => {
		goTo("providers");
	}, [goTo]);

	return (
		<ApiKeyForm
			title="Add your OpenAI API key"
			description="Pay-as-you-go via your own OpenAI account."
			placeholder="sk-..."
			helpUrl="https://platform.openai.com/api-keys"
			helpLabel="Get an API key from platform.openai.com →"
			backTo="/setup/providers"
			onSubmit={async (apiKey) => {
				await setMutation.mutateAsync({ apiKey });
				track("onboarding_provider_connected", {
					provider: "openai",
					method: "api-key",
				});
				navigate({ to: "/setup/providers", replace: true });
			}}
		/>
	);
}
