import { chatServiceTrpc } from "@superset/chat/client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { track } from "renderer/lib/analytics";
import { useOnboardingStore } from "renderer/stores/onboarding";
import { ApiKeyForm } from "../../components/ApiKeyForm";

export const Route = createFileRoute(
	"/_authenticated/setup/providers/claude-code/api-key/",
)({
	component: AnthropicApiKeyPage,
});

function AnthropicApiKeyPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);
	const setMutation = chatServiceTrpc.auth.setAnthropicApiKey.useMutation();

	useEffect(() => {
		goTo("providers");
	}, [goTo]);

	return (
		<ApiKeyForm
			title="Add your Anthropic API key"
			description="Pay-as-you-go via your own Anthropic account."
			placeholder="sk-ant-..."
			helpUrl="https://console.anthropic.com/settings/keys"
			helpLabel="Get an API key from console.anthropic.com →"
			backTo="/setup/providers"
			onSubmit={async (apiKey) => {
				await setMutation.mutateAsync({ apiKey });
				track("onboarding_provider_connected", {
					provider: "anthropic",
					method: "api-key",
				});
				navigate({ to: "/setup/providers", replace: true });
			}}
		/>
	);
}
