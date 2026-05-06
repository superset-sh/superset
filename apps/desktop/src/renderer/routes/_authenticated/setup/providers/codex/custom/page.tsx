import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LuExternalLink } from "react-icons/lu";
import { useOnboardingStore } from "renderer/stores/onboarding";
import { SetupButton } from "../../../components/SetupButton";
import { StepHeader, StepShell } from "../../../components/StepShell";

export const Route = createFileRoute(
	"/_authenticated/setup/providers/codex/custom/",
)({
	component: OpenAICustomPage,
});

function OpenAICustomPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);

	useEffect(() => {
		goTo("providers");
	}, [goTo]);

	return (
		<StepShell backTo="/setup/providers">
			<StepHeader
				title="Custom OpenAI configuration"
				subtitle="Configure a custom base URL or model in Settings. Once you save, return here and onboarding will detect your provider and continue."
			/>

			<div className="flex w-[273px] flex-col gap-2 self-center">
				<SetupButton onClick={() => navigate({ to: "/settings/models" })}>
					<span className="inline-flex items-center justify-center gap-1.5">
						Open Settings → Models
						<LuExternalLink className="size-3.5" />
					</span>
				</SetupButton>
			</div>
		</StepShell>
	);
}
