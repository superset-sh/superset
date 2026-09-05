import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Slider } from "@superset/ui/slider";
import { Switch } from "@superset/ui/switch";
import { useId, useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import type {
	AccountEngineAgentSettings,
	AutoSwitchStrategy,
	PollIntervalSeconds,
} from "../../../../hooks/useAccountEngineSettings";
import {
	engineErrorCode,
	engineErrorMessage,
} from "../../utils/engineErrorMessage";

const POLL_INTERVALS: PollIntervalSeconds[] = [30, 60, 120, 300];

const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 100;
// The host accepts 60 to 3600 seconds; a control must not offer a value the
// host always refuses.
const MIN_COOLDOWN_MINUTES = 1;
const MAX_COOLDOWN_MINUTES = 60;
/** The host's own cap on model windows (`.max(8)` on the settings schema). */
const MAX_MODEL_WINDOWS = 8;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

interface AutoSwitchSettingsProps {
	/** "Claude Code" / "Codex", as the account sections title them. */
	agentLabel: string;
	settings: AccountEngineAgentSettings;
	/** False in a cloud sandbox and on hosts running no engine (KTD1). */
	engineAvailable: boolean;
	/** False on win32 (KTD13). */
	platformSupported: boolean;
	/** False when another Superset instance holds the engine lock (KTD5). */
	lockOwner: boolean;
	/** Host offline or the settings read still in flight. */
	disabled: boolean;
	/**
	 * Sends one patch to the host. Rejecting reverts every control this panel
	 * owns to the values the host last confirmed and shows the refusal.
	 */
	onCommit: (patch: Partial<AccountEngineAgentSettings>) => Promise<unknown>;
}

/**
 * R10 to R16, per agent. Every control is optimistic-free on purpose: the
 * draft it shows while you type is dropped the moment the host answers, so a
 * refusal can never leave a number on screen that the engine is not using.
 */
export function AutoSwitchSettings({
	agentLabel,
	settings,
	engineAvailable,
	platformSupported,
	lockOwner,
	disabled,
	onCommit,
}: AutoSwitchSettingsProps) {
	const { t } = useLingui();
	const fieldId = useId();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Drafts only exist between a keystroke and the host's answer; `null`
	// means "show what the host confirmed".
	const [thresholdDraft, setThresholdDraft] = useState<number | null>(null);
	const [cooldownDraft, setCooldownDraft] = useState<string | null>(null);
	const [modelsDraft, setModelsDraft] = useState<string | null>(null);

	const confirmedModels = settings.modelWindows.join(", ");
	const threshold = thresholdDraft ?? settings.thresholdPercent;
	const cooldownMinutes =
		cooldownDraft ?? String(Math.round(settings.cooldownSeconds / 60));
	const models = modelsDraft ?? confirmedModels;

	const commit = async (patch: Partial<AccountEngineAgentSettings>) => {
		setError(null);
		setPending(true);
		try {
			await onCommit(patch);
		} catch (failure) {
			setError(
				engineErrorMessage(failure) ??
					t({
						message: `Not saved (${engineErrorCode(failure)}). The previous value still stands.`,
					}),
			);
		} finally {
			// Whichever way it went, the host's own value is the truth now.
			setThresholdDraft(null);
			setCooldownDraft(null);
			setModelsDraft(null);
			setPending(false);
		}
	};

	const blockedMessage = !platformSupported ? (
		<Trans>
			Automatic switching needs macOS or Linux. On Windows you can still switch
			the active {agentLabel} account by hand.
		</Trans>
	) : !engineAvailable ? (
		<Trans>
			The account engine is not running on this host, so {agentLabel} accounts
			cannot switch automatically.
		</Trans>
	) : !lockOwner ? (
		<Trans>
			Another Superset instance on this machine owns automatic switching. Change
			these settings there.
		</Trans>
	) : null;

	const controlsDisabled = disabled || pending;

	return (
		<div className="rounded-lg border bg-card/40 p-2.5">
			<div className="flex items-center gap-2">
				<span className="text-xs font-medium">
					<Trans>Switch accounts automatically</Trans>
				</span>
				{blockedMessage === null && (
					<Switch
						className="ml-auto"
						aria-label={t({
							message: "Switch accounts automatically",
						})}
						checked={settings.enabled}
						disabled={controlsDisabled}
						onCheckedChange={(enabled) => void commit({ enabled })}
					/>
				)}
			</div>
			{blockedMessage !== null ? (
				<p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
					<LuTriangleAlert className="mt-px size-3 shrink-0" />
					<span>{blockedMessage}</span>
				</p>
			) : (
				<>
					<p className="mt-1 text-[11px] text-muted-foreground">
						<Trans>
							Move running and new {agentLabel} sessions to another account
							before this one runs out.
						</Trans>
					</p>
					{settings.enabled && (
						<div className="mt-2.5 grid gap-3 border-t pt-2.5 md:grid-cols-2">
							<div className="flex flex-col gap-1">
								<Label
									htmlFor={`${fieldId}-threshold`}
									className="text-[11px] font-medium"
								>
									<Trans>Switch at</Trans>
								</Label>
								<div className="flex items-center gap-2">
									<Slider
										className="flex-1"
										aria-label={t({
											message: "Switch at",
										})}
										min={MIN_THRESHOLD}
										max={MAX_THRESHOLD}
										step={1}
										value={[threshold]}
										disabled={controlsDisabled}
										onValueChange={([next]) =>
											setThresholdDraft(next ?? threshold)
										}
										onValueCommit={([next]) =>
											void commit({
												thresholdPercent: clamp(
													next ?? threshold,
													MIN_THRESHOLD,
													MAX_THRESHOLD,
												),
											})
										}
									/>
									<Input
										id={`${fieldId}-threshold`}
										type="number"
										inputMode="numeric"
										min={MIN_THRESHOLD}
										max={MAX_THRESHOLD}
										className="h-6 w-14 px-1.5 text-[11px] tabular-nums"
										value={String(threshold)}
										disabled={controlsDisabled}
										onChange={(event) => {
											const next = Number.parseInt(event.target.value, 10);
											setThresholdDraft(
												Number.isNaN(next) ? MIN_THRESHOLD : next,
											);
										}}
										onBlur={() =>
											void commit({
												thresholdPercent: clamp(
													threshold,
													MIN_THRESHOLD,
													MAX_THRESHOLD,
												),
											})
										}
									/>
									<span className="text-[11px] text-muted-foreground">%</span>
								</div>
								<p className="text-[10px] text-muted-foreground">
									<Trans>
										Percent used at which any window of the active account
										counts as near its limit.
									</Trans>
								</p>
							</div>

							<div className="flex flex-col gap-1">
								<Label className="text-[11px] font-medium">
									<Trans>Which account to move to</Trans>
								</Label>
								<Select
									value={settings.strategy}
									disabled={controlsDisabled}
									onValueChange={(next) =>
										void commit({ strategy: next as AutoSwitchStrategy })
									}
								>
									<SelectTrigger
										size="sm"
										className="h-6 text-[11px]"
										aria-label={t({
											message: "Which account to move to",
										})}
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="best">
											<Trans>Most headroom</Trans>
										</SelectItem>
										<SelectItem value="consume-first">
											<Trans>Use up the soonest reset</Trans>
										</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-[10px] text-muted-foreground">
									{settings.strategy === "best" ? (
										<Trans>
											Stay until the active account nears its limit, then move
											to the account with the most headroom
										</Trans>
									) : (
										<Trans>
											Prefer the account whose weekly window resets soonest, so
											no quota expires unused
										</Trans>
									)}
								</p>
							</div>

							<div className="flex flex-col gap-1">
								<Label
									htmlFor={`${fieldId}-models`}
									className="text-[11px] font-medium"
								>
									<Trans>Model windows</Trans>
								</Label>
								<Input
									id={`${fieldId}-models`}
									className="h-6 px-1.5 text-[11px]"
									placeholder={t({
										message: "Fable, Opus",
									})}
									value={models}
									disabled={controlsDisabled}
									onChange={(event) => setModelsDraft(event.target.value)}
									onBlur={() => {
										if (models === confirmedModels) {
											setModelsDraft(null);
											return;
										}
										void commit({
											modelWindows: models
												.split(",")
												.map((name) => name.trim())
												.filter((name) => name.length > 0)
												.slice(0, MAX_MODEL_WINDOWS),
										});
									}}
								/>
								<p className="text-[10px] text-muted-foreground">
									<Trans>
										Model names whose weekly window also counts toward the
										threshold, separated by commas. Leave empty to watch only
										the account-wide windows.
									</Trans>
								</p>
							</div>

							<div className="flex gap-3">
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<Label className="text-[11px] font-medium">
										<Trans>Check usage every</Trans>
									</Label>
									<Select
										value={String(settings.pollIntervalSeconds)}
										disabled={controlsDisabled}
										onValueChange={(next) =>
											void commit({
												pollIntervalSeconds: Number.parseInt(
													next,
													10,
												) as PollIntervalSeconds,
											})
										}
									>
										<SelectTrigger
											size="sm"
											className="h-6 text-[11px]"
											aria-label={t({
												message: "Check usage every",
											})}
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{POLL_INTERVALS.map((seconds) => (
												<SelectItem key={seconds} value={String(seconds)}>
													{seconds === 30 ? (
														<Trans>30 seconds</Trans>
													) : seconds === 60 ? (
														<Trans>1 minute</Trans>
													) : seconds === 120 ? (
														<Trans>2 minutes</Trans>
													) : (
														<Trans>5 minutes</Trans>
													)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<Label
										htmlFor={`${fieldId}-cooldown`}
										className="text-[11px] font-medium"
									>
										<Trans>Wait between switches</Trans>
									</Label>
									<div className="flex items-center gap-1.5">
										<Input
											id={`${fieldId}-cooldown`}
											type="number"
											inputMode="numeric"
											min={MIN_COOLDOWN_MINUTES}
											max={MAX_COOLDOWN_MINUTES}
											className="h-6 w-14 px-1.5 text-[11px] tabular-nums"
											value={cooldownMinutes}
											disabled={controlsDisabled}
											onChange={(event) => setCooldownDraft(event.target.value)}
											onBlur={() => {
												const parsed = Number.parseInt(cooldownMinutes, 10);
												if (Number.isNaN(parsed)) {
													setCooldownDraft(null);
													return;
												}
												void commit({
													cooldownSeconds:
														clamp(
															parsed,
															MIN_COOLDOWN_MINUTES,
															MAX_COOLDOWN_MINUTES,
														) * 60,
												});
											}}
										/>
										<span className="text-[11px] text-muted-foreground">
											<Trans>min</Trans>
										</span>
									</div>
								</div>
							</div>
						</div>
					)}
				</>
			)}
			{error !== null && (
				<p
					role="alert"
					className="mt-2 flex items-start gap-1.5 text-[11px] text-red-500"
				>
					<LuTriangleAlert className="mt-px size-3 shrink-0" />
					<span>{error}</span>
				</p>
			)}
		</div>
	);
}
