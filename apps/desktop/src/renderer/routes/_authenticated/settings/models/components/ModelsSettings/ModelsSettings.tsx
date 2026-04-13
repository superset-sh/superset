import { chatServiceTrpc } from "@superset/chat/client";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { AnthropicOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/AnthropicOAuthDialog";
import { OpenAIOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/OpenAIOAuthDialog";
import { useAnthropicOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useAnthropicOAuth";
import { useOpenAIOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useOpenAIOAuth";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { AccountCard } from "./components/AccountCard";
import { ConfigRow } from "./components/ConfigRow";
import { SettingsSection } from "./components/SettingsSection";
import {
	buildAnthropicEnvText,
	EMPTY_ANTHROPIC_FORM,
	getProviderSubtitle,
	getStatusBadge,
	parseAnthropicForm,
	resolveProviderStatus,
} from "./utils";

interface ModelsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

const DIALOG_CONTEXT = {
	isModelSelectorOpen: true,
	onModelSelectorOpenChange: () => {},
} as const;

export function ModelsSettings({ visibleItems }: ModelsSettingsProps) {
	const showAnthropic = isItemVisible(
		SETTING_ITEM_ID.MODELS_ANTHROPIC,
		visibleItems,
	);
	const showOpenAI = isItemVisible(SETTING_ITEM_ID.MODELS_OPENAI, visibleItems);
	const showNextEdit = isItemVisible(
		SETTING_ITEM_ID.MODELS_NEXT_EDIT,
		visibleItems,
	);
	const [apiKeysOpen, setApiKeysOpen] = useState(true);
	const [overrideOpen, setOverrideOpen] = useState(true);
	const [nextEditAdvancedOpen, setNextEditAdvancedOpen] = useState(true);
	const [openAIApiKeyInput, setOpenAIApiKeyInput] = useState("");
	const [anthropicApiKeyInput, setAnthropicApiKeyInput] = useState("");
	const [inceptionApiKeyInput, setInceptionApiKeyInput] = useState("");
	const [anthropicForm, setAnthropicForm] = useState(EMPTY_ANTHROPIC_FORM);
	const [nextEditForm, setNextEditForm] = useState({
		enabled: false,
		maxTokens: "8192",
		temperature: "0.3",
		topP: "0.8",
		presencePenalty: "1",
		stopText: "",
	});

	const { data: providerStatuses, refetch: refetchProviderStatuses } =
		electronTrpc.modelProviders.getStatuses.useQuery();
	const anthropicDiagnosticStatus = providerStatuses?.find(
		(status) => status.providerId === "anthropic",
	);
	const openAIDiagnosticStatus = providerStatuses?.find(
		(status) => status.providerId === "openai",
	);
	const { data: anthropicAuthStatus, refetch: refetchAnthropicAuthStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const { data: openAIAuthStatus, refetch: refetchOpenAIAuthStatus } =
		chatServiceTrpc.auth.getOpenAIStatus.useQuery();
	const { data: inceptionAuthStatus, refetch: refetchInceptionAuthStatus } =
		chatServiceTrpc.auth.getInceptionStatus.useQuery();
	const { data: anthropicEnvConfig, refetch: refetchAnthropicEnvConfig } =
		chatServiceTrpc.auth.getAnthropicEnvConfig.useQuery();
	const { data: nextEditConfig, refetch: refetchNextEditConfig } =
		chatServiceTrpc.nextEdit.getConfig.useQuery();
	const { data: nextEditUsageSummary } =
		chatServiceTrpc.nextEdit.getUsageSummary.useQuery();
	const setAnthropicApiKeyMutation =
		chatServiceTrpc.auth.setAnthropicApiKey.useMutation();
	const clearAnthropicApiKeyMutation =
		chatServiceTrpc.auth.clearAnthropicApiKey.useMutation();
	const setAnthropicEnvConfigMutation =
		chatServiceTrpc.auth.setAnthropicEnvConfig.useMutation();
	const clearAnthropicEnvConfigMutation =
		chatServiceTrpc.auth.clearAnthropicEnvConfig.useMutation();
	const setOpenAIApiKeyMutation =
		chatServiceTrpc.auth.setOpenAIApiKey.useMutation();
	const clearOpenAIApiKeyMutation =
		chatServiceTrpc.auth.clearOpenAIApiKey.useMutation();
	const setInceptionApiKeyMutation =
		chatServiceTrpc.auth.setInceptionApiKey.useMutation();
	const clearInceptionApiKeyMutation =
		chatServiceTrpc.auth.clearInceptionApiKey.useMutation();
	const setNextEditConfigMutation =
		chatServiceTrpc.nextEdit.setConfig.useMutation();
	const clearProviderIssueMutation =
		electronTrpc.modelProviders.clearIssue.useMutation();

	const {
		isStartingOAuth: isStartingAnthropicOAuth,
		startAnthropicOAuth,
		oauthDialog: anthropicOAuthDialog,
	} = useAnthropicOAuth({
		...DIALOG_CONTEXT,
		onAuthStateChange: async () => {
			await Promise.all([
				refetchAnthropicAuthStatus(),
				refetchProviderStatuses(),
			]);
		},
	});
	const {
		isStartingOAuth: isStartingOpenAIOAuth,
		startOpenAIOAuth,
		oauthDialog: openAIOAuthDialog,
	} = useOpenAIOAuth(DIALOG_CONTEXT);

	const hasAnthropicConfig = !!anthropicEnvConfig?.envText.trim().length;
	const isSavingAnthropicApiKey =
		setAnthropicApiKeyMutation.isPending ||
		clearAnthropicApiKeyMutation.isPending;
	const isSavingAnthropicConfig =
		setAnthropicEnvConfigMutation.isPending ||
		clearAnthropicEnvConfigMutation.isPending;
	const isSavingOpenAIConfig =
		setOpenAIApiKeyMutation.isPending || clearOpenAIApiKeyMutation.isPending;
	const isSavingInceptionApiKey =
		setInceptionApiKeyMutation.isPending ||
		clearInceptionApiKeyMutation.isPending;
	const isSavingNextEditConfig = setNextEditConfigMutation.isPending;

	useEffect(() => {
		setAnthropicForm(parseAnthropicForm(anthropicEnvConfig?.envText ?? ""));
		setAnthropicApiKeyInput("");
	}, [anthropicEnvConfig?.envText]);

	useEffect(() => {
		if (!nextEditConfig) {
			return;
		}

		setNextEditForm({
			enabled: nextEditConfig.enabled,
			maxTokens: String(nextEditConfig.maxTokens),
			temperature: String(nextEditConfig.temperature),
			topP: String(nextEditConfig.topP),
			presencePenalty: String(nextEditConfig.presencePenalty),
			stopText: nextEditConfig.stop.join("\n"),
		});
	}, [nextEditConfig]);

	const anthropicStatus = useMemo(
		() =>
			resolveProviderStatus({
				providerId: "anthropic",
				authStatus: anthropicAuthStatus,
				diagnosticStatus: anthropicDiagnosticStatus,
			}),
		[anthropicAuthStatus, anthropicDiagnosticStatus],
	);

	const openAIStatus = useMemo(
		() =>
			resolveProviderStatus({
				providerId: "openai",
				authStatus: openAIAuthStatus,
				diagnosticStatus: openAIDiagnosticStatus,
			}),
		[openAIAuthStatus, openAIDiagnosticStatus],
	);

	const anthropicSubtitle = useMemo(
		() => getProviderSubtitle("anthropic", anthropicStatus),
		[anthropicStatus],
	);
	const openAISubtitle = useMemo(
		() => getProviderSubtitle("openai", openAIStatus),
		[openAIStatus],
	);
	const anthropicBadge = useMemo(
		() => getStatusBadge(anthropicStatus),
		[anthropicStatus],
	);
	const openAIBadge = useMemo(
		() => getStatusBadge(openAIStatus),
		[openAIStatus],
	);

	const clearProviderIssue = (providerId: "anthropic" | "openai") =>
		clearProviderIssueMutation.mutateAsync({ providerId });

	const formatTokenCount = (value: number) => {
		return new Intl.NumberFormat("en-US").format(value);
	};

	const formatUsd = (value: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: value >= 1 ? 2 : 4,
			maximumFractionDigits: 4,
		}).format(value);
	};

	const saveAnthropicForm = async (nextForm = anthropicForm) => {
		const envText = buildAnthropicEnvText(nextForm);
		try {
			if (envText) {
				await setAnthropicEnvConfigMutation.mutateAsync({ envText });
			} else {
				await clearAnthropicEnvConfigMutation.mutateAsync();
			}
			await Promise.all([
				refetchAnthropicEnvConfig(),
				refetchAnthropicAuthStatus(),
				clearProviderIssue("anthropic"),
				refetchProviderStatuses(),
			]);
			toast.success("Anthropic settings updated");
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save");
			return false;
		}
	};

	const saveAnthropicApiKey = async () => {
		const apiKey = anthropicApiKeyInput.trim();
		if (!apiKey) return;
		try {
			await setAnthropicApiKeyMutation.mutateAsync({ apiKey });
			setAnthropicApiKeyInput("");
			await Promise.all([
				refetchAnthropicAuthStatus(),
				clearProviderIssue("anthropic"),
				refetchProviderStatuses(),
			]);
			toast.success("Anthropic API key updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save");
		}
	};

	const saveOpenAIApiKey = async () => {
		const apiKey = openAIApiKeyInput.trim();
		if (!apiKey) return;
		try {
			await setOpenAIApiKeyMutation.mutateAsync({ apiKey });
			setOpenAIApiKeyInput("");
			await Promise.all([
				refetchOpenAIAuthStatus(),
				clearProviderIssue("openai"),
				refetchProviderStatuses(),
			]);
			toast.success("OpenAI API key updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save");
		}
	};

	const saveInceptionApiKey = async () => {
		const apiKey = inceptionApiKeyInput.trim();
		if (!apiKey) return;
		try {
			await setInceptionApiKeyMutation.mutateAsync({ apiKey });
			setInceptionApiKeyInput("");
			await refetchInceptionAuthStatus();
			toast.success("Inception API key updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save");
		}
	};

	const saveNextEditConfig = async (
		nextForm = nextEditForm,
	): Promise<boolean> => {
		const maxTokens = Number.parseInt(nextForm.maxTokens, 10);
		const temperature = Number.parseFloat(nextForm.temperature);
		const topP = Number.parseFloat(nextForm.topP);
		const presencePenalty = Number.parseFloat(nextForm.presencePenalty);
		const stop = nextForm.stopText
			.split("\n")
			.map((entry) => entry.trim())
			.filter(
				(entry, index, array) =>
					entry.length > 0 && array.indexOf(entry) === index,
			);

		if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) {
			toast.error("max_tokens must be an integer between 1 and 8192.");
			return false;
		}
		if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
			toast.error("temperature must be between 0.0 and 1.0.");
			return false;
		}
		if (!Number.isFinite(topP) || topP < 0 || topP > 1) {
			toast.error("top_p must be between 0.0 and 1.0.");
			return false;
		}
		if (
			!Number.isFinite(presencePenalty) ||
			presencePenalty < -2 ||
			presencePenalty > 2
		) {
			toast.error("presence_penalty must be between -2.0 and 2.0.");
			return false;
		}
		if (stop.length > 4) {
			toast.error("Stop sequences support up to 4 entries.");
			return false;
		}

		try {
			await setNextEditConfigMutation.mutateAsync({
				enabled: nextForm.enabled,
				model: "mercury-edit-2",
				maxTokens,
				temperature,
				topP,
				presencePenalty,
				stop,
			});
			await refetchNextEditConfig();
			toast.success("Next Edit settings updated");
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save");
			return false;
		}
	};

	const renderProviderAction = ({
		status,
		startOAuth,
		isStartingOAuth,
		canDisconnect,
		onDisconnect,
	}: {
		status: typeof anthropicStatus | typeof openAIStatus;
		startOAuth: () => Promise<void>;
		isStartingOAuth: boolean;
		canDisconnect: boolean;
		onDisconnect: () => void;
	}) => {
		if (!status || status.connectionState === "disconnected") {
			return (
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						void startOAuth();
					}}
					disabled={isStartingOAuth}
				>
					Connect
				</Button>
			);
		}

		if (status.issue?.remediation === "reconnect") {
			return (
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						void startOAuth();
					}}
					disabled={isStartingOAuth}
				>
					Reconnect
				</Button>
			);
		}

		if (canDisconnect) {
			return (
				<Button variant="ghost" size="sm" onClick={onDisconnect}>
					Logout
				</Button>
			);
		}

		return (
			<Button
				variant="outline"
				size="sm"
				onClick={() => {
					void startOAuth();
				}}
				disabled={isStartingOAuth}
			>
				Connect
			</Button>
		);
	};

	return (
		<>
			<div className="w-full max-w-4xl p-6">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">Models</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage your model accounts, API keys, and provider settings.
					</p>
				</div>

				<div className="space-y-8">
					{showAnthropic ? (
						<SettingsSection title="Anthropic Account">
							<AccountCard
								title="Claude"
								subtitle={anthropicSubtitle}
								badge={anthropicBadge?.label}
								badgeVariant={anthropicBadge?.variant}
								muted={anthropicStatus?.connectionState !== "connected"}
								actions={renderProviderAction({
									status: anthropicStatus,
									startOAuth: startAnthropicOAuth,
									isStartingOAuth: isStartingAnthropicOAuth,
									canDisconnect: anthropicOAuthDialog.canDisconnect,
									onDisconnect: anthropicOAuthDialog.onDisconnect,
								})}
							/>
						</SettingsSection>
					) : null}

					{showOpenAI ? (
						<SettingsSection title="Codex Account">
							<AccountCard
								title="ChatGPT"
								subtitle={openAISubtitle}
								badge={openAIBadge?.label}
								badgeVariant={openAIBadge?.variant}
								muted={openAIStatus?.connectionState !== "connected"}
								actions={renderProviderAction({
									status: openAIStatus,
									startOAuth: startOpenAIOAuth,
									isStartingOAuth: isStartingOpenAIOAuth,
									canDisconnect: openAIOAuthDialog.canDisconnect,
									onDisconnect: openAIOAuthDialog.onDisconnect,
								})}
							/>
						</SettingsSection>
					) : null}

					<Collapsible open={apiKeysOpen} onOpenChange={setApiKeysOpen}>
						<div className="space-y-3">
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-2 text-left text-sm font-semibold"
								>
									<HiChevronDown
										className={`size-4 transition-transform ${apiKeysOpen ? "" : "-rotate-90"}`}
									/>
									API Keys
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="space-y-3">
								{showAnthropic ? (
									<ConfigRow
										title="Anthropic API Key"
										field={
											<Input
												type="password"
												value={anthropicApiKeyInput}
												onChange={(event) => {
													setAnthropicApiKeyInput(event.target.value);
												}}
												placeholder={
													anthropicStatus?.authMethod === "api_key"
														? "Saved Anthropic API key"
														: "sk-ant-..."
												}
												className="font-mono"
												disabled={isSavingAnthropicApiKey}
											/>
										}
										onSave={() => {
											void saveAnthropicApiKey();
										}}
										onClear={() => {
											const nextForm = { ...anthropicForm, apiKey: "" };
											void (async () => {
												try {
													await clearAnthropicApiKeyMutation.mutateAsync();
													setAnthropicApiKeyInput("");
													setAnthropicForm(nextForm);
													await Promise.all([
														refetchAnthropicAuthStatus(),
														clearProviderIssue("anthropic"),
														refetchProviderStatuses(),
													]);
													toast.success("Anthropic API key cleared");
												} catch (error) {
													toast.error(
														error instanceof Error
															? error.message
															: "Failed to clear",
													);
												}
											})();
										}}
										disableSave={
											isSavingAnthropicApiKey ||
											anthropicApiKeyInput.trim().length === 0
										}
										disableClear={
											isSavingAnthropicApiKey ||
											anthropicStatus?.authMethod !== "api_key"
										}
									/>
								) : null}
								{showOpenAI ? (
									<ConfigRow
										title="OpenAI API Key"
										field={
											<Input
												type="password"
												value={openAIApiKeyInput}
												onChange={(event) => {
													setOpenAIApiKeyInput(event.target.value);
												}}
												placeholder={
													openAIStatus?.authMethod === "api_key"
														? "Saved OpenAI API key"
														: "sk-..."
												}
												className="font-mono"
												disabled={isSavingOpenAIConfig}
											/>
										}
										onSave={() => {
											void saveOpenAIApiKey();
										}}
										onClear={() => {
											void (async () => {
												try {
													await clearOpenAIApiKeyMutation.mutateAsync();
													setOpenAIApiKeyInput("");
													await Promise.all([
														refetchOpenAIAuthStatus(),
														clearProviderIssue("openai"),
														refetchProviderStatuses(),
													]);
													toast.success("OpenAI API key cleared");
												} catch (error) {
													toast.error(
														error instanceof Error
															? error.message
															: "Failed to clear",
													);
												}
											})();
										}}
										disableSave={
											isSavingOpenAIConfig ||
											openAIApiKeyInput.trim().length === 0
										}
										disableClear={
											isSavingOpenAIConfig ||
											openAIStatus?.authMethod !== "api_key"
										}
									/>
								) : null}
							</CollapsibleContent>
						</div>
					</Collapsible>

					{showAnthropic ? (
						<Collapsible open={overrideOpen} onOpenChange={setOverrideOpen}>
							<div className="space-y-3">
								<CollapsibleTrigger asChild>
									<button
										type="button"
										className="flex items-center gap-2 text-left text-sm font-semibold"
									>
										<HiChevronDown
											className={`size-4 transition-transform ${overrideOpen ? "" : "-rotate-90"}`}
										/>
										Override Provider
									</button>
								</CollapsibleTrigger>
								<CollapsibleContent className="space-y-3">
									<ConfigRow
										title="API token"
										description="Anthropic auth token"
										field={
											<Input
												type="password"
												value={anthropicForm.authToken}
												onChange={(event) => {
													setAnthropicForm((current) => ({
														...current,
														authToken: event.target.value,
													}));
												}}
												placeholder="sk-ant-..."
												className="font-mono"
												disabled={isSavingAnthropicConfig}
											/>
										}
										onSave={() => {
											void saveAnthropicForm();
										}}
										onClear={() => {
											const nextForm = { ...anthropicForm, authToken: "" };
											setAnthropicForm(nextForm);
											void saveAnthropicForm(nextForm);
										}}
										disableSave={isSavingAnthropicConfig}
										disableClear={
											isSavingAnthropicConfig ||
											anthropicForm.authToken.length === 0
										}
									/>
									<ConfigRow
										title="Base URL"
										description="Custom API base URL"
										field={
											<Input
												value={anthropicForm.baseUrl}
												onChange={(event) => {
													setAnthropicForm((current) => ({
														...current,
														baseUrl: event.target.value,
													}));
												}}
												placeholder="https://api.anthropic.com"
												className="font-mono"
												disabled={isSavingAnthropicConfig}
											/>
										}
										onSave={() => {
											void saveAnthropicForm();
										}}
										onClear={() => {
											const nextForm = { ...anthropicForm, baseUrl: "" };
											setAnthropicForm(nextForm);
											void saveAnthropicForm(nextForm);
										}}
										disableSave={isSavingAnthropicConfig}
										disableClear={
											isSavingAnthropicConfig ||
											anthropicForm.baseUrl.length === 0
										}
									/>
									<ConfigRow
										title="Additional env"
										description="Extra variables to keep with Anthropic config"
										field={
											<Textarea
												value={anthropicForm.extraEnv}
												onChange={(event) => {
													setAnthropicForm((current) => ({
														...current,
														extraEnv: event.target.value,
													}));
												}}
												placeholder={
													"CLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-east-1"
												}
												className="min-h-24 font-mono text-xs"
												disabled={isSavingAnthropicConfig}
											/>
										}
										onSave={() => {
											void saveAnthropicForm();
										}}
										onClear={
											hasAnthropicConfig
												? () => {
														const nextForm = {
															...anthropicForm,
															extraEnv: "",
														};
														setAnthropicForm(nextForm);
														void saveAnthropicForm(nextForm);
													}
												: undefined
										}
										clearLabel="Clear"
										disableSave={isSavingAnthropicConfig}
										disableClear={
											isSavingAnthropicConfig ||
											anthropicForm.extraEnv.length === 0
										}
									/>
								</CollapsibleContent>
							</div>
						</Collapsible>
					) : null}

					{showNextEdit ? (
						<SettingsSection
							title="Inception Next Edit"
							description="Inline code completion in the code editor. Suggestions appear as ghost text and Tab accepts them."
							action={
								<span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
									{nextEditForm.enabled ? "Enabled" : "Disabled"}
								</span>
							}
						>
							<ConfigRow
								title="Next Edit API Key"
								description="Stored like other managed model credentials. Required before completions can run."
								field={
									<Input
										type="password"
										value={inceptionApiKeyInput}
										onChange={(event) => {
											setInceptionApiKeyInput(event.target.value);
										}}
										placeholder={
											inceptionAuthStatus?.method === "api_key"
												? "Saved Inception API key"
												: "inception_..."
										}
										className="font-mono"
										disabled={isSavingInceptionApiKey}
									/>
								}
								onSave={() => {
									void saveInceptionApiKey();
								}}
								onClear={() => {
									void (async () => {
										try {
											await clearInceptionApiKeyMutation.mutateAsync();
											setInceptionApiKeyInput("");
											await refetchInceptionAuthStatus();
											toast.success("Inception API key cleared");
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Failed to clear",
											);
										}
									})();
								}}
								disableSave={
									isSavingInceptionApiKey ||
									inceptionApiKeyInput.trim().length === 0
								}
								disableClear={
									isSavingInceptionApiKey ||
									inceptionAuthStatus?.method !== "api_key"
								}
							/>
							<ConfigRow
								title="Enable Next Edit"
								description="Backend-enforced switch. When disabled, the editor never calls the completion endpoint."
								field={
									<div className="flex items-center gap-3">
										<Switch
											checked={nextEditForm.enabled}
											onCheckedChange={(checked) => {
												setNextEditForm((current) => ({
													...current,
													enabled: checked === true,
												}));
											}}
											disabled={isSavingNextEditConfig}
										/>
										<span className="text-sm text-muted-foreground">
											{nextEditForm.enabled
												? "Inline completions are active."
												: "Inline completions are off."}
										</span>
									</div>
								}
								onSave={() => {
									void saveNextEditConfig();
								}}
								disableSave={isSavingNextEditConfig}
							/>
							<div className="rounded-lg border bg-muted/20 p-4">
								<div className="flex items-start justify-between gap-4">
									<div>
										<h3 className="text-sm font-semibold">Estimated usage</h3>
										<p className="mt-1 text-xs text-muted-foreground">
											Based on successful Inception requests sent from this
											desktop app. This is a local estimate, not your exact
											Inception billing total.
										</p>
									</div>
									<div className="text-right text-xs text-muted-foreground">
										<div>
											Input:{" "}
											{formatUsd(
												nextEditUsageSummary?.pricing
													.inputCostPerMillionTokensUsd ?? 0,
											)}
											{" / 1M"}
										</div>
										<div>
											Output:{" "}
											{formatUsd(
												nextEditUsageSummary?.pricing
													.outputCostPerMillionTokensUsd ?? 0,
											)}
											{" / 1M"}
										</div>
									</div>
								</div>
								<div className="mt-4 grid gap-3 md:grid-cols-3">
									{[
										{ label: "Today", bucket: nextEditUsageSummary?.today },
										{
											label: "This month",
											bucket: nextEditUsageSummary?.month,
										},
										{
											label: "All time",
											bucket: nextEditUsageSummary?.allTime,
										},
									].map(({ label, bucket }) => (
										<div
											key={label}
											className="rounded-md border bg-background p-3"
										>
											<div className="text-xs font-medium text-muted-foreground">
												{label}
											</div>
											<div className="mt-2 text-lg font-semibold">
												{formatUsd(bucket?.estimatedCostUsd ?? 0)}
											</div>
											<div className="mt-2 space-y-1 text-xs text-muted-foreground">
												<div>
													Requests:{" "}
													{formatTokenCount(bucket?.requestCount ?? 0)}
												</div>
												<div>
													Input: {formatTokenCount(bucket?.promptTokens ?? 0)}
												</div>
												<div>
													Output:{" "}
													{formatTokenCount(bucket?.completionTokens ?? 0)}
												</div>
											</div>
										</div>
									))}
								</div>
								<div className="mt-4 grid gap-3 md:grid-cols-2">
									{[
										{
											label: "FIM",
											bucket: nextEditUsageSummary?.byEndpoint.fim,
										},
										{
											label: "Next Edit",
											bucket: nextEditUsageSummary?.byEndpoint.next_edit,
										},
									].map(({ label, bucket }) => (
										<div
											key={label}
											className="rounded-md border bg-background p-3"
										>
											<div className="text-xs font-medium text-muted-foreground">
												{label}
											</div>
											<div className="mt-2 text-lg font-semibold">
												{formatUsd(bucket?.estimatedCostUsd ?? 0)}
											</div>
											<div className="mt-2 space-y-1 text-xs text-muted-foreground">
												<div>
													Requests:{" "}
													{formatTokenCount(bucket?.requestCount ?? 0)}
												</div>
												<div>
													Total tokens:{" "}
													{formatTokenCount(bucket?.totalTokens ?? 0)}
												</div>
											</div>
										</div>
									))}
								</div>
								<div className="mt-3 text-xs text-muted-foreground">
									Last used:{" "}
									{nextEditUsageSummary?.lastUsedAt
										? new Date(nextEditUsageSummary.lastUsedAt).toLocaleString(
												"ja-JP",
											)
										: "No usage yet"}
								</div>
							</div>
							<Collapsible
								open={nextEditAdvancedOpen}
								onOpenChange={setNextEditAdvancedOpen}
							>
								<div className="space-y-3">
									<CollapsibleTrigger asChild>
										<button
											type="button"
											className="flex items-center gap-2 text-left text-sm font-semibold"
										>
											<HiChevronDown
												className={`size-4 transition-transform ${nextEditAdvancedOpen ? "" : "-rotate-90"}`}
											/>
											Advanced
										</button>
									</CollapsibleTrigger>
									<CollapsibleContent className="space-y-3">
										<ConfigRow
											title="max_tokens"
											description="Official Inception default: 8192"
											field={
												<Input
													type="number"
													min={1}
													max={8192}
													step={1}
													value={nextEditForm.maxTokens}
													onChange={(event) => {
														setNextEditForm((current) => ({
															...current,
															maxTokens: event.target.value,
														}));
													}}
													className="font-mono"
													disabled={isSavingNextEditConfig}
												/>
											}
											onSave={() => {
												void saveNextEditConfig();
											}}
											disableSave={isSavingNextEditConfig}
										/>
										<ConfigRow
											title="temperature"
											description="Official range for Mercury Edit 2: 0.0 to 1.0"
											field={
												<Input
													type="number"
													min={0.5}
													max={1}
													step={0.05}
													value={nextEditForm.temperature}
													onChange={(event) => {
														setNextEditForm((current) => ({
															...current,
															temperature: event.target.value,
														}));
													}}
													className="font-mono"
													disabled={isSavingNextEditConfig}
												/>
											}
											onSave={() => {
												void saveNextEditConfig();
											}}
											disableSave={isSavingNextEditConfig}
										/>
										<ConfigRow
											title="top_p"
											field={
												<Input
													type="number"
													min={0}
													max={1}
													step={0.05}
													value={nextEditForm.topP}
													onChange={(event) => {
														setNextEditForm((current) => ({
															...current,
															topP: event.target.value,
														}));
													}}
													className="font-mono"
													disabled={isSavingNextEditConfig}
												/>
											}
											onSave={() => {
												void saveNextEditConfig();
											}}
											disableSave={isSavingNextEditConfig}
										/>
										<ConfigRow
											title="presence_penalty"
											field={
												<Input
													type="number"
													min={-2}
													max={2}
													step={0.1}
													value={nextEditForm.presencePenalty}
													onChange={(event) => {
														setNextEditForm((current) => ({
															...current,
															presencePenalty: event.target.value,
														}));
													}}
													className="font-mono"
													disabled={isSavingNextEditConfig}
												/>
											}
											onSave={() => {
												void saveNextEditConfig();
											}}
											disableSave={isSavingNextEditConfig}
										/>
										<ConfigRow
											title="stop"
											description="One sequence per line. Up to 4 sequences."
											field={
												<Textarea
													value={nextEditForm.stopText}
													onChange={(event) => {
														setNextEditForm((current) => ({
															...current,
															stopText: event.target.value,
														}));
													}}
													placeholder={"```\n<|/code_to_edit|>"}
													className="min-h-24 font-mono text-xs"
													disabled={isSavingNextEditConfig}
												/>
											}
											onSave={() => {
												void saveNextEditConfig();
											}}
											onClear={() => {
												const nextForm = {
													...nextEditForm,
													stopText: "",
												};
												setNextEditForm(nextForm);
												void saveNextEditConfig(nextForm);
											}}
											disableSave={isSavingNextEditConfig}
											disableClear={
												isSavingNextEditConfig ||
												nextEditForm.stopText.trim().length === 0
											}
										/>
									</CollapsibleContent>
								</div>
							</Collapsible>
						</SettingsSection>
					) : null}
				</div>
			</div>

			<AnthropicOAuthDialog {...anthropicOAuthDialog} />
			<OpenAIOAuthDialog {...openAIOAuthDialog} />
		</>
	);
}
