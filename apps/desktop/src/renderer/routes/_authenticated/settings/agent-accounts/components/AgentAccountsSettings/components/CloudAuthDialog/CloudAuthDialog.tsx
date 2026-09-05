import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import {
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
} from "lucide-react";
import { useState } from "react";
import { SiVercel } from "react-icons/si";

import type {
	CloudAuthMethod,
	CloudAuthState,
	CustomProvider,
	SaveCredentialInput,
} from "../../../../hooks/useAgentCredential";

interface CloudAuthDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	presetId: string;
	label: string;
	state: CloudAuthState;
	accountLabel: string | null;
	chooseMethod: (method: CloudAuthMethod) => void;
	save: (input: SaveCredentialInput) => Promise<unknown>;
	disconnect: () => Promise<unknown>;
}

export function CloudAuthDialog({
	open,
	onOpenChange,
	presetId,
	label,
	state,
	accountLabel,
	chooseMethod,
	save,
	disconnect,
}: CloudAuthDialogProps) {
	const { t } = useLingui();
	const isClaude = presetId === "claude";
	const [view, setView] = useState<"main" | "custom">("main");
	const [baseUrlDraft, setBaseUrlDraft] = useState("");
	const [expanded, setExpanded] = useState<CustomProvider | null>(null);
	const [tokenDraft, setTokenDraft] = useState("");
	const [apiKeyDraft, setApiKeyDraft] = useState("");
	const [apiKeyAdvanced, setApiKeyAdvanced] = useState(false);
	const [checking, setChecking] = useState<string | null>(null);

	/**
	 * One call does both: the server checks the credential against the
	 * provider and only stores it if that succeeds. A refusal keeps the
	 * dialog where it is and repeats what the provider said.
	 */
	const verifyAndSave = async (
		id: string,
		input: SaveCredentialInput,
		onOk?: () => void,
	) => {
		setChecking(id);
		try {
			await save(input);
			onOk?.();
			toast.success(t({ message: "Verified and saved" }));
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t({ message: "The provider refused it." }),
			);
		} finally {
			setChecking(null);
		}
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) setView("main");
		onOpenChange(next);
	};

	const providers: Array<{
		id: CustomProvider;
		label: string;
		icon: React.ReactNode;
		advanced?: boolean;
	}> = [
		{
			id: "gateway",
			label: t({ message: "Vercel AI Gateway" }),
			icon: <SiVercel className="size-4" />,
		},
	];
	const customLabel = providers.find(
		(provider) => provider.id === state.customProvider,
	)?.label;

	const optionClass = (selected: boolean) =>
		cn(
			"rounded-lg border border-border px-4 py-3 transition-colors",
			selected && "border-primary/60 bg-primary/[0.04] ring-1 ring-primary/40",
		);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-xl">
				{view === "custom" ? (
					<>
						<DialogHeader>
							<div className="flex items-center gap-2">
								<Button
									aria-label={t({ message: "Back" })}
									className="size-7"
									onClick={() => setView("main")}
									size="icon"
									variant="ghost"
								>
									<ChevronLeft className="size-4" />
								</Button>
								<DialogTitle>
									<Trans>Custom provider</Trans>
								</DialogTitle>
							</div>
							<DialogDescription>
								<Trans>
									Route {label} through a provider you run, with the credentials
									you hold. Saved values are handed to the agent at launch.
								</Trans>
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							{providers.map((provider) => {
								const isOpen = expanded === provider.id;
								const saved = state.customSaved && isOpen;
								return (
									<div
										className={cn(
											"rounded-lg border border-border",
											isOpen && "border-primary/40",
										)}
										key={provider.id}
									>
										<button
											className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm"
											onClick={() => setExpanded(isOpen ? null : provider.id)}
											type="button"
										>
											{isOpen ? (
												<ChevronDown className="size-4 text-muted-foreground" />
											) : (
												<ChevronRight className="size-4 text-muted-foreground" />
											)}
											<span className="text-muted-foreground">
												{provider.icon}
											</span>
											<span className="font-medium">{provider.label}</span>
											{provider.advanced ? (
												<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
													<Trans>Advanced</Trans>
												</span>
											) : null}
											{saved ? (
												<Check className="ml-auto size-4 text-emerald-500" />
											) : null}
										</button>
										{isOpen ? (
											<div className="space-y-3 border-t border-border px-3 py-3">
												<ProviderForm
													checking={checking === provider.id}
													onSave={(value, baseUrl) =>
														verifyAndSave(provider.id, {
															kind: "api_key",
															value,
															baseUrl,
														})
													}
													provider={provider.id}
												/>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>
								<Trans>{label} in cloud workspaces</Trans>
							</DialogTitle>
							<DialogDescription>
								<Trans>
									Pick how {label} signs in inside a sandbox. The credential is
									handed to the agent process when it launches and is not stored
									in the sandbox.
								</Trans>
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-3">
							<RadioGroup
								className="gap-3"
								onValueChange={(value) =>
									chooseMethod(value as CloudAuthMethod)
								}
								value={state.method === "custom" ? "" : state.method}
							>
								{/* Subscription */}
								<div className={optionClass(state.method === "subscription")}>
									<div className="flex items-center gap-3">
										<RadioGroupItem
											id={`${presetId}-sub`}
											value="subscription"
										/>
										<Label
											className="flex flex-1 items-center gap-2 font-medium"
											htmlFor={`${presetId}-sub`}
										>
											<Trans>Subscription</Trans>
											{state.subscriptionConnected ? (
												<Check className="size-4 text-emerald-500" />
											) : null}
										</Label>
										{state.subscriptionConnected ? (
											<Button
												onClick={() => void disconnect()}
												size="sm"
												variant="ghost"
											>
												<Trans>Sign out</Trans>
											</Button>
										) : null}
									</div>
									{state.method === "subscription" ? (
										state.subscriptionConnected ? (
											<div className="mt-3 pl-7">
												<p className="text-xs text-muted-foreground">
													{accountLabel ? (
														<Trans>Signed in as {accountLabel}</Trans>
													) : (
														<Trans>
															Signed in. The token is stored encrypted and is
															never shown again.
														</Trans>
													)}
												</p>
											</div>
										) : (
											<div className="mt-3 space-y-2 pl-7">
												<p className="text-xs text-muted-foreground">
													{isClaude ? (
														<Trans>
															Sign in with your Claude account, or run{" "}
															<code className="rounded bg-muted px-1 py-0.5 font-mono">
																claude setup-token
															</code>
															<button
																aria-label={t({ message: "Copy command" })}
																className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
																type="button"
															>
																<Copy className="size-3.5" />
															</button>{" "}
															in a terminal and paste the token here.
														</Trans>
													) : (
														<Trans>
															Signs in the way the Codex CLI does. Or run{" "}
															<code className="rounded bg-muted px-1 py-0.5 font-mono">
																codex login
															</code>{" "}
															in a terminal and paste its token here.
														</Trans>
													)}
												</p>
												<div className="flex items-center gap-2">
													<Input
														autoComplete="off"
														className="font-mono text-sm"
														onChange={(e) => setTokenDraft(e.target.value)}
														placeholder={
															isClaude
																? "CLAUDE_CODE_OAUTH_TOKEN"
																: "CODEX_ACCESS_TOKEN"
														}
														type="password"
														value={tokenDraft}
													/>
													<Button
														disabled={
															!tokenDraft.trim() || checking === "subscription"
														}
														onClick={() =>
															verifyAndSave(
																"subscription",
																{
																	kind: "subscription",
																	value: tokenDraft.trim(),
																},
																() => setTokenDraft(""),
															)
														}
														size="sm"
														variant="outline"
													>
														{checking === "subscription" ? (
															<Trans>Checking…</Trans>
														) : (
															<Trans>Save</Trans>
														)}
													</Button>
												</div>
											</div>
										)
									) : null}
								</div>

								{/* API key */}
								<div className={optionClass(state.method === "api_key")}>
									<div className="flex items-center gap-3">
										<RadioGroupItem id={`${presetId}-key`} value="api_key" />
										<Label
											className="flex flex-1 items-center gap-2 font-medium"
											htmlFor={`${presetId}-key`}
										>
											<Trans>API key</Trans>
											{state.apiKeySaved ? (
												<Check className="size-4 text-emerald-500" />
											) : null}
										</Label>
										{state.apiKeySaved || state.customSaved ? (
											<Button
												onClick={() => void disconnect()}
												size="sm"
												variant="ghost"
											>
												<Trans>Remove</Trans>
											</Button>
										) : null}
										<a
											className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
											href={
												isClaude
													? "https://console.anthropic.com/settings/keys"
													: "https://platform.openai.com/api-keys"
											}
											rel="noreferrer"
											target="_blank"
										>
											<Trans>Get key</Trans>
											<ExternalLink className="size-3.5" />
										</a>
									</div>
									{state.method === "api_key" ? (
										<div className="mt-3 space-y-2 pl-7">
											<button
												className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
												onClick={() => setApiKeyAdvanced((value) => !value)}
												type="button"
											>
												{apiKeyAdvanced ? (
													<ChevronDown className="size-4" />
												) : (
													<ChevronRight className="size-4" />
												)}
												<Trans>Advanced</Trans>
											</button>
											{apiKeyAdvanced ? (
												<Field
													label={t({ message: "Base URL" })}
													onChange={setBaseUrlDraft}
													placeholder={
														isClaude
															? "https://api.anthropic.com"
															: "https://api.openai.com/v1"
													}
													value={baseUrlDraft}
												/>
											) : null}
											<div className="flex items-center gap-2">
												<Input
													autoComplete="off"
													className="font-mono text-sm"
													onChange={(e) => setApiKeyDraft(e.target.value)}
													placeholder={
														state.apiKeySaved
															? "••••••••••••••••"
															: isClaude
																? "ANTHROPIC_API_KEY"
																: "OPENAI_API_KEY"
													}
													type="password"
													value={apiKeyDraft}
												/>
												<Button
													disabled={
														!apiKeyDraft.trim() || checking === "api_key"
													}
													onClick={() =>
														verifyAndSave(
															"api_key",
															{
																kind: "api_key",
																value: apiKeyDraft.trim(),
																...(baseUrlDraft.trim()
																	? { baseUrl: baseUrlDraft.trim() }
																	: {}),
															},
															() => setApiKeyDraft(""),
														)
													}
													size="sm"
												>
													{checking === "api_key" ? (
														<Trans>Checking…</Trans>
													) : (
														<Trans>Save</Trans>
													)}
												</Button>
											</div>
										</div>
									) : null}
								</div>
							</RadioGroup>

							{/* Custom provider: a nested view, not a radio */}
							<button
								className={cn(
									optionClass(state.method === "custom"),
									"flex w-full items-center gap-3 text-left",
								)}
								onClick={() => setView("custom")}
								type="button"
							>
								<span className="flex-1 font-medium">
									<Trans>Custom provider</Trans>
									{state.method === "custom" && customLabel ? (
										<span className="ml-2 text-sm font-normal text-muted-foreground">
											{customLabel}
										</span>
									) : null}
								</span>
								{state.method === "custom" && state.customSaved ? (
									<Check className="size-4 text-emerald-500" />
								) : null}
								<ChevronRight className="size-4 text-muted-foreground" />
							</button>
						</div>
					</>
				)}

				<DialogFooter>
					<Button onClick={() => handleOpenChange(false)} variant="outline">
						<Trans>Done</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function SecretField({
	placeholder,
	label,
	value,
	onChange,
}: {
	placeholder: string;
	label?: string;
	value?: string;
	onChange?: (value: string) => void;
}) {
	const { t } = useLingui();
	const [shown, setShown] = useState(false);
	return (
		<div className="space-y-1.5">
			{label ? <Label className="text-sm font-medium">{label}</Label> : null}
			<div className="relative">
				<Input
					autoComplete="off"
					className="pr-9 font-mono text-sm"
					onChange={(e) => onChange?.(e.target.value)}
					placeholder={placeholder}
					type={shown ? "text" : "password"}
					value={value}
				/>
				<button
					aria-label={shown ? t({ message: "Hide" }) : t({ message: "Show" })}
					className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					onClick={() => setShown((value) => !value)}
					type="button"
				>
					{shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</button>
			</div>
		</div>
	);
}

function Field({
	label,
	placeholder,
	value,
	onChange,
}: {
	label: string;
	placeholder?: string;
	value?: string;
	onChange?: (value: string) => void;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-sm font-medium">{label}</Label>
			<Input
				autoComplete="off"
				className="font-mono text-sm"
				onChange={(e) => onChange?.(e.target.value)}
				placeholder={placeholder}
				value={value ?? ""}
			/>
		</div>
	);
}

function ProviderForm({
	provider,
	onSave,
	checking,
}: {
	provider: CustomProvider;
	onSave: (value: string, baseUrl: string) => void;
	checking: boolean;
}) {
	const { t } = useLingui();
	const [draft, setDraft] = useState("");
	const [baseUrl, setBaseUrl] = useState("https://ai-gateway.vercel.sh/v1");
	const filled = draft.trim().length > 0 && baseUrl.trim().length > 0;
	if (provider !== "gateway") return null;
	return (
		<>
			<a
				className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
				href="https://vercel.com/ai-gateway"
				rel="noreferrer"
				target="_blank"
			>
				<Trans>Get an API key</Trans>
				<ExternalLink className="size-3.5" />
			</a>
			<Field
				label={t({ message: "Base URL" })}
				onChange={setBaseUrl}
				placeholder="https://ai-gateway.vercel.sh/v1"
				value={baseUrl}
			/>
			<div className="flex items-center gap-2">
				<div className="flex-1">
					<SecretField
						onChange={setDraft}
						placeholder="AI_GATEWAY_API_KEY"
						value={draft}
					/>
				</div>
				<Button
					disabled={!filled || checking}
					onClick={() => onSave(draft.trim(), baseUrl.trim())}
					size="sm"
				>
					{checking ? <Trans>Checking…</Trans> : <Trans>Save</Trans>}
				</Button>
			</div>
		</>
	);
}
