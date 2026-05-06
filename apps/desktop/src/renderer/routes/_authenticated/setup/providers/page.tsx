import { chatServiceTrpc } from "@superset/chat/client";
import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { LuKeyRound, LuSettings } from "react-icons/lu";
import { STEP_ROUTES, useOnboardingStore } from "renderer/stores/onboarding";
import { SetupButton } from "../components/SetupButton";
import { StepHeader, StepShell } from "../components/StepShell";
import { ClaudeBrandIcon } from "./components/ClaudeBrandIcon";
import { CodexBrandIcon } from "./components/CodexBrandIcon";
import { ProviderOptionCard } from "./components/ProviderOptionCard";

type ConnectionMethod = "oauth" | "api-key" | "custom";

export const Route = createFileRoute("/_authenticated/setup/providers/")({
	component: OnboardingProvidersPage,
});

function OnboardingProvidersPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);
	const markComplete = useOnboardingStore((s) => s.markComplete);
	const markSkipped = useOnboardingStore((s) => s.markSkipped);
	const completed = useOnboardingStore((s) => s.completed.providers);
	const manualWalkthrough = useOnboardingStore((s) => s.manualWalkthrough);

	const { data: anthropicAuthStatus, isPending: isAnthropicPending } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const { data: openAIAuthStatus, isPending: isOpenAIPending } =
		chatServiceTrpc.auth.getOpenAIStatus.useQuery();

	const claudeConnected =
		!!anthropicAuthStatus?.authenticated && !anthropicAuthStatus.issue;
	const codexConnected =
		!!openAIAuthStatus?.authenticated && !openAIAuthStatus.issue;
	const isStatusPending = isAnthropicPending || isOpenAIPending;
	const atLeastOneConnected = claudeConnected || codexConnected;

	const wasConfiguredOnMount = useRef<boolean | null>(null);
	useEffect(() => {
		if (!isStatusPending && wasConfiguredOnMount.current === null) {
			wasConfiguredOnMount.current = atLeastOneConnected;
		}
	}, [isStatusPending, atLeastOneConnected]);

	const [claudeMethod, setClaudeMethod] = useState<ConnectionMethod>("oauth");
	const [codexMethod, setCodexMethod] = useState<ConnectionMethod>("oauth");
	const [reconfiguringClaude, setReconfiguringClaude] = useState(false);
	const [reconfiguringCodex, setReconfiguringCodex] = useState(false);

	useEffect(() => {
		goTo("providers");
	}, [goTo]);

	const shouldAutoAdvance =
		!completed && !manualWalkthrough && wasConfiguredOnMount.current === true;

	useEffect(() => {
		if (shouldAutoAdvance) {
			markComplete("providers");
			navigate({ to: STEP_ROUTES["gh-cli"], replace: true });
		}
	}, [shouldAutoAdvance, markComplete, navigate]);

	if (isStatusPending || shouldAutoAdvance) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-[#151110]">
				<Spinner className="size-6 text-[#a8a5a3]" />
			</div>
		);
	}

	const handleContinueToNextStep = () => {
		markComplete("providers");
		navigate({ to: STEP_ROUTES["gh-cli"] });
	};

	const handleSkipStep = () => {
		markSkipped("providers");
		navigate({ to: STEP_ROUTES["gh-cli"] });
	};

	const handleConnect = (
		base: "/setup/providers/claude-code" | "/setup/providers/codex",
		method: ConnectionMethod,
	) => {
		if (method === "api-key") navigate({ to: `${base}/api-key` });
		else if (method === "custom") navigate({ to: `${base}/custom` });
		else navigate({ to: base });
	};

	const subtitle = atLeastOneConnected
		? "Add another provider or continue to the next step."
		: "Connect Claude Code, Codex, or both to get started.";

	return (
		<StepShell maxWidth="lg">
			<StepHeader title="Connect AI Provider" subtitle={subtitle} />

			<ProviderSection
				label="Claude Code"
				connected={claudeConnected}
				reconfiguring={reconfiguringClaude}
				onConnect={() =>
					handleConnect("/setup/providers/claude-code", claudeMethod)
				}
				onReconfigure={() => setReconfiguringClaude(true)}
				onCancelReconfigure={() => setReconfiguringClaude(false)}
				connectedPanel={
					<ConnectedPanel
						icon={
							<ClaudeBrandIcon
								className="size-11 rounded-lg"
								iconClassName="size-6"
							/>
						}
						title="Claude Code is connected"
					/>
				}
				options={
					<>
						<ProviderOptionCard
							icon={
								<ClaudeBrandIcon className="size-full" iconClassName="size-6" />
							}
							title="Claude Pro/Max"
							description="Use your Claude subscription for unlimited access."
							recommended
							selected={claudeMethod === "oauth"}
							onSelect={() => setClaudeMethod("oauth")}
						/>
						<ProviderOptionCard
							icon={<MutedIcon icon={<LuKeyRound className="size-5" />} />}
							title="Anthropic API Key"
							description="Pay-as-you-go with your own API key."
							selected={claudeMethod === "api-key"}
							onSelect={() => setClaudeMethod("api-key")}
						/>
						<ProviderOptionCard
							icon={<MutedIcon icon={<LuSettings className="size-5" />} />}
							title="Custom Model"
							description="Use a custom base URL and model."
							selected={claudeMethod === "custom"}
							onSelect={() => setClaudeMethod("custom")}
						/>
					</>
				}
			/>

			<ProviderSection
				label="Codex"
				connected={codexConnected}
				reconfiguring={reconfiguringCodex}
				onConnect={() => handleConnect("/setup/providers/codex", codexMethod)}
				onReconfigure={() => setReconfiguringCodex(true)}
				onCancelReconfigure={() => setReconfiguringCodex(false)}
				connectedPanel={
					<ConnectedPanel
						icon={
							<CodexBrandIcon
								className="size-11 rounded-lg bg-[#eae8e6]"
								iconClassName="size-6 text-[#151110]"
							/>
						}
						title="Codex is connected"
					/>
				}
				options={
					<>
						<ProviderOptionCard
							icon={
								<CodexBrandIcon
									className="size-full bg-[#eae8e6]"
									iconClassName="size-6 text-[#151110]"
								/>
							}
							title="ChatGPT Plus/Pro"
							description="Use your ChatGPT subscription via Codex."
							recommended
							selected={codexMethod === "oauth"}
							onSelect={() => setCodexMethod("oauth")}
						/>
						<ProviderOptionCard
							icon={<MutedIcon icon={<LuKeyRound className="size-5" />} />}
							title="OpenAI API Key"
							description="Pay-as-you-go with your own API key."
							selected={codexMethod === "api-key"}
							onSelect={() => setCodexMethod("api-key")}
						/>
						<ProviderOptionCard
							icon={<MutedIcon icon={<LuSettings className="size-5" />} />}
							title="Custom Model"
							description="Use a custom base URL and model."
							selected={codexMethod === "custom"}
							onSelect={() => setCodexMethod("custom")}
						/>
					</>
				}
			/>

			<div className="flex w-[273px] flex-col gap-2 self-center">
				{atLeastOneConnected && (
					<SetupButton onClick={handleContinueToNextStep}>Continue</SetupButton>
				)}
				<SetupButton variant="link" onClick={handleSkipStep}>
					Skip for now
				</SetupButton>
			</div>
		</StepShell>
	);
}

interface ProviderSectionProps {
	label: string;
	connected: boolean;
	reconfiguring: boolean;
	onConnect: () => void;
	onReconfigure: () => void;
	onCancelReconfigure: () => void;
	connectedPanel: ReactNode;
	options: ReactNode;
}

function ProviderSection({
	label,
	connected,
	reconfiguring,
	onConnect,
	onReconfigure,
	onCancelReconfigure,
	connectedPanel,
	options,
}: ProviderSectionProps) {
	const showConnectedPanel = connected && !reconfiguring;

	const headerAction = connected ? (
		<button
			type="button"
			onClick={reconfiguring ? onCancelReconfigure : onReconfigure}
			className="text-[11px] font-medium text-[#a8a5a3] underline-offset-4 transition-colors hover:text-[#eae8e6] hover:underline"
		>
			{reconfiguring ? "Cancel" : "Reconfigure"}
		</button>
	) : null;

	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<h2 className="text-[12px] font-semibold uppercase tracking-wide text-[#a8a5a3]">
						{label}
					</h2>
					{connected && (
						<span
							aria-hidden
							className="size-1.5 rounded-full bg-emerald-500"
						/>
					)}
				</div>
				{headerAction}
			</div>

			{showConnectedPanel ? (
				connectedPanel
			) : (
				<>
					<div className="space-y-3">{options}</div>
					<div className="mx-auto w-[273px] pt-1">
						<SetupButton onClick={onConnect}>
							{reconfiguring ? `Reconfigure ${label}` : `Connect ${label}`}
						</SetupButton>
					</div>
				</>
			)}
		</section>
	);
}

function MutedIcon({ icon }: { icon: React.ReactNode }) {
	return (
		<div className="flex size-full items-center justify-center bg-[#151110] text-[#a8a5a3]">
			{icon}
		</div>
	);
}

function ConnectedPanel({
	icon,
	title,
	subtitle,
}: {
	icon: React.ReactNode;
	title: string;
	subtitle?: string;
}) {
	return (
		<div className="flex items-center gap-4 rounded-xl border border-[#2a2827] bg-[#201e1c] p-4">
			<div className="size-11 shrink-0 overflow-hidden rounded-lg">{icon}</div>
			<div className="min-w-0 flex-1">
				<p className="text-[13px] font-semibold text-[#eae8e6]">{title}</p>
				{subtitle && <p className="text-[11px] text-[#a8a5a3]">{subtitle}</p>}
			</div>
		</div>
	);
}
