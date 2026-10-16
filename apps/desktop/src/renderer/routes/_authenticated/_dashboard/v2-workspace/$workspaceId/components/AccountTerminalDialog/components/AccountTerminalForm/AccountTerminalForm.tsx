import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Loader2 } from "lucide-react";
import { useId, useRef, useState } from "react";

interface LaunchAccount {
	selection: string | null;
	identity: string;
	email: string;
	label: string;
}

interface AccountTerminalFormProps {
	mode?: "start" | "chat";
	configs: Array<{ id: string; label: string }>;
	configId: string;
	onConfigChange: (id: string) => void;
	accounts: LaunchAccount[];
	loading: boolean;
	refreshing: boolean;
	error: string | null;
	launching: boolean;
	onRefresh: () => Promise<void>;
	onCancel: () => void;
	onLaunch: (
		account: Pick<LaunchAccount, "selection" | "identity">,
	) => Promise<void>;
}

function accountKey(account: LaunchAccount) {
	return JSON.stringify([account.selection, account.identity]);
}

export function AccountTerminalForm({
	mode = "start",
	configs,
	configId,
	onConfigChange,
	accounts,
	loading,
	refreshing,
	error,
	launching,
	onRefresh,
	onCancel,
	onLaunch,
}: AccountTerminalFormProps) {
	const { t } = useLingui();
	const agentId = useId();
	const radioName = useId();
	const [selected, setSelected] = useState<string | null>(null);
	const [launchError, setLaunchError] = useState<string | null>(null);
	const inFlight = useRef(false);
	const account = accounts.find((entry) => accountKey(entry) === selected);
	const selectionChanged = selected !== null && !account;
	const canLaunch = Boolean(
		account &&
			!error &&
			!loading &&
			!refreshing &&
			!launching &&
			configs.some((config) => config.id === configId),
	);
	const failure =
		error ??
		launchError ??
		(selectionChanged
			? t({ message: "The selected login changed. Choose an account again." })
			: null);
	return (
		<form
			className="min-w-0 space-y-4"
			onSubmit={async (event) => {
				event.preventDefault();
				if (!canLaunch || !account || inFlight.current) return;
				inFlight.current = true;
				setLaunchError(null);
				try {
					await onLaunch({
						selection: account.selection,
						identity: account.identity,
					});
				} catch (cause) {
					setLaunchError(
						errorMessage(
							cause,
							mode === "chat"
								? t({ message: "Could not start chat" })
								: t({ message: "Could not start agent terminal" }),
						),
					);
				} finally {
					inFlight.current = false;
				}
			}}
		>
			<div className="space-y-2">
				<Label htmlFor={agentId}>
					<Trans>Agent</Trans>
				</Label>
				<Select
					value={configId}
					onValueChange={onConfigChange}
					disabled={launching || configs.length === 0}
				>
					<SelectTrigger id={agentId} className="w-full">
						<SelectValue placeholder={t({ message: "Select agent" })} />
					</SelectTrigger>
					<SelectContent>
						{configs.map((config) => (
							<SelectItem key={config.id} value={config.id}>
								{config.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<fieldset disabled={launching} className="min-w-0 space-y-2">
				<legend className="text-sm font-medium">
					<Trans>Account</Trans>
				</legend>
				{loading ? (
					<output className="text-sm text-muted-foreground">
						<Trans>Loading accounts…</Trans>
					</output>
				) : null}
				{!loading && !error && accounts.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						<Trans>
							No available subscription accounts. Add or sign in to an account
							in Usage, then refresh.
						</Trans>
					</p>
				) : null}
				<div className="max-h-60 space-y-1 overflow-y-auto">
					{accounts.map((entry) => {
						const key = accountKey(entry);
						return (
							<label
								key={key}
								className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 has-[:checked]:border-ring has-[:checked]:bg-muted/50"
							>
								<input
									type="radio"
									name={radioName}
									value={key}
									checked={selected === key}
									onChange={() => {
										setSelected(key);
										setLaunchError(null);
									}}
									className="size-4 shrink-0 accent-foreground"
								/>
								<span className="min-w-0">
									<span className="block truncate text-sm">{entry.email}</span>
									<span className="block truncate text-xs text-muted-foreground">
										{entry.selection === null ? (
											<Trans>System</Trans>
										) : (
											entry.label
										)}
									</span>
								</span>
							</label>
						);
					})}
				</div>
			</fieldset>
			{failure && (
				<p role="alert" className="text-sm text-destructive">
					{failure}
				</p>
			)}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button
					type="button"
					variant="ghost"
					disabled={launching || refreshing || !configId}
					onClick={() => {
						setSelected(null);
						setLaunchError(null);
						void onRefresh();
					}}
				>
					<Trans>Refresh</Trans>
				</Button>
				<div className="ml-auto flex max-w-full flex-wrap justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						disabled={launching}
						onClick={onCancel}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button type="submit" disabled={!canLaunch}>
						{launching && <Loader2 className="size-4 animate-spin" />}
						{mode === "chat" ? (
							<Trans>Start chat</Trans>
						) : (
							<Trans>Start terminal</Trans>
						)}
					</Button>
				</div>
			</div>
		</form>
	);
}
