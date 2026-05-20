import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { track } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { StepHeader, StepShell } from "../../components/StepShell";

export const Route = createFileRoute(
	"/_authenticated/onboarding/prompt/$projectId/",
)({
	component: OnboardingPromptPage,
});

function OnboardingPromptPage() {
	const { projectId } = Route.useParams();
	const navigate = useNavigate();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { submit } = useWorkspaceCreates();
	const [prompt, setPrompt] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const hostReady = activeHostUrl !== null && machineId !== null;
	const canSubmit = prompt.trim().length > 0 && hostReady && !submitting;

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!canSubmit || !machineId) return;
		setSubmitting(true);
		const trimmed = prompt.trim();
		try {
			const workspaceId = crypto.randomUUID();
			const { completed } = submit({
				hostId: machineId,
				snapshot: {
					id: workspaceId,
					projectId,
					namingPrompt: trimmed,
				},
			});

			track("onboarding_finished", { outcome: "completed" });
			await apiTrpcClient.user.completeOnboarding.mutate();
			await authClient.getSession({ query: { disableCookieCache: true } });

			navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId },
				replace: true,
			});

			void completed.then((outcome) => {
				if (!outcome.ok) {
					toast.error(`Failed to create workspace: ${outcome.error}`);
				}
			});
		} catch (error) {
			setSubmitting(false);
			console.error("[onboarding] workspace create failed", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to create your first workspace",
			);
		}
	};

	return (
		<StepShell maxWidth="lg">
			<StepHeader
				title="What do you want to work on?"
				subtitle="Describe a task. We'll create a workspace and use this as the kickoff prompt."
			/>

			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<Textarea
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="e.g. Add dark mode toggle, fix the checkout bug…"
					rows={4}
					disabled={submitting}
					autoFocus
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							if (canSubmit) void handleSubmit(e);
						}
					}}
				/>
				<div className="flex justify-end">
					<Button type="submit" size="sm" disabled={!canSubmit}>
						{submitting ? "Creating workspace…" : "Finish setup"}
					</Button>
				</div>
			</form>
		</StepShell>
	);
}
