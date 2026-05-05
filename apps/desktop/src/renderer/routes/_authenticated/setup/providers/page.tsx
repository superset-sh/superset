import { chatServiceTrpc } from "@superset/chat/client";
import { Spinner } from "@superset/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LuKeyRound, LuSettings } from "react-icons/lu";
import { STEP_ROUTES, useOnboardingStore } from "renderer/stores/onboarding";
import { SetupButton } from "../components/SetupButton";
import { StepHeader, StepShell } from "../components/StepShell";
import { ClaudeBrandIcon } from "./components/ClaudeBrandIcon";
import { CodexBrandIcon } from "./components/CodexBrandIcon";
import { ProviderOptionCard } from "./components/ProviderOptionCard";

type Provider = "claude-code" | "codex";
type ConnectionMethod = "oauth" | "api-key" | "custom";

export const Route = createFileRoute("/_authenticated/setup/providers/")({
	component: OnboardingProvidersPage,
});

function OnboardingProvidersPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);
	const markComplete = useOnboardingStore((s) => s.markComplete);
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

	const [provider, setProvider] = useState<Provider>("claude-code");
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

	const handleConnectSelected = () => {
		const method = provider === "claude-code" ? claudeMethod : codexMethod;
		const base =
			provider === "claude-code"
				? "/setup/providers/claude-code"
				: "/setup/providers/codex";
		if (method === "api-key") {
			navigate({ to: `${base}/api-key` });
		} else if (method === "custom") {
			navigate({ to: `${base}/custom` });
		} else {
			navigate({ to: base });
		}
	};

	const subtitle = atLeastOneConnected
		? "Add another provider or continue to the next step."
		: "Choose how you'd like to connect your provider.";

	return (
		<StepShell maxWidth="lg">
			<StepHeader title="Connect AI Provider" subtitle={subtitle} />

			<Tabs
				value={provider}
				onValueChange={(value) => setProvider(value as Provider)}
			>
				<TabsList className="mx-auto grid w-full max-w-sm grid-cols-2 bg-[#201e1c]">
					<TabsTrigger
						value="claude-code"
						className="data-[state=active]:bg-[#151110] data-[state=active]:text-[#eae8e6]"
					>
						<span className="flex items-center gap-1.5 text-[#a8a5a3] data-[state=active]:text-[#eae8e6]">
							Claude Code
							{claudeConnected && (
								<span
									aria-hidden
									className="size-1.5 rounded-full bg-emerald-500"
								/>
							)}
						</span>
					</TabsTrigger>
					<TabsTrigger
						value="codex"
						className="data-[state=active]:bg-[#151110] data-[state=active]:text-[#eae8e6]"
					>
						<span className="flex items-center gap-1.5 text-[#a8a5a3] data-[state=active]:text-[#eae8e6]">
							Codex
							{codexConnected && (
								<span
									aria-hidden
									className="size-1.5 rounded-full bg-emerald-500"
								/>
							)}
						</span>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="claude-code" className="mt-6 space-y-3">
					{claudeConnected && !reconfiguringClaude ? (
						<ConnectedPanel
							icon={
								<ClaudeBrandIcon
									className="size-11 rounded-lg"
									iconClassName="size-6"
								/>
							}
							title="Claude Code is connected"
							onReconfigure={() => setReconfiguringClaude(true)}
						/>
					) : (
						<>
							<ProviderOptionCard
								icon={
									<ClaudeBrandIcon
										className="size-full"
										iconClassName="size-6"
									/>
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
					)}
				</TabsContent>

				<TabsContent value="codex" className="mt-6 space-y-3">
					{codexConnected && !reconfiguringCodex ? (
						<ConnectedPanel
							icon={
								<CodexBrandIcon
									className="size-11 rounded-lg bg-[#eae8e6]"
									iconClassName="size-6 text-[#151110]"
								/>
							}
							title="Codex is connected"
							onReconfigure={() => setReconfiguringCodex(true)}
						/>
					) : (
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
					)}
				</TabsContent>
			</Tabs>

			<div className="flex w-[273px] flex-col gap-2 self-center">
				{(() => {
					const activeTabConnected =
						provider === "claude-code" ? claudeConnected : codexConnected;
					const isReconfiguring =
						provider === "claude-code"
							? reconfiguringClaude
							: reconfiguringCodex;

					if (activeTabConnected && !isReconfiguring) {
						return (
							<SetupButton onClick={handleContinueToNextStep}>
								Continue
							</SetupButton>
						);
					}

					const providerLabel =
						provider === "claude-code" ? "Claude Code" : "Codex";
					return (
						<>
							<SetupButton onClick={handleConnectSelected}>
								{isReconfiguring
									? `Reconfigure ${providerLabel}`
									: `Connect ${providerLabel}`}
							</SetupButton>
							{(atLeastOneConnected || isReconfiguring) && (
								<SetupButton
									variant="link"
									onClick={() => {
										if (isReconfiguring) {
											if (provider === "claude-code")
												setReconfiguringClaude(false);
											else setReconfiguringCodex(false);
										} else {
											handleContinueToNextStep();
										}
									}}
								>
									{isReconfiguring
										? "Cancel — keep current"
										: "Skip — continue to next step"}
								</SetupButton>
							)}
						</>
					);
				})()}
			</div>
		</StepShell>
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
	onReconfigure,
}: {
	icon: React.ReactNode;
	title: string;
	onReconfigure: () => void;
}) {
	return (
		<div className="flex items-center gap-4 rounded-xl border border-[#2a2827] bg-[#201e1c] p-4">
			<div className="size-11 shrink-0 overflow-hidden rounded-lg">{icon}</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="text-[13px] font-semibold text-[#eae8e6]">{title}</p>
					<span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
				</div>
				<p className="text-[11px] text-[#a8a5a3]">
					You can also reconfigure this provider.
				</p>
			</div>
			<button
				type="button"
				onClick={onReconfigure}
				className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-[#a8a5a3] transition-colors hover:bg-white/5 hover:text-[#eae8e6]"
			>
				Reconfigure
			</button>
		</div>
	);
}
