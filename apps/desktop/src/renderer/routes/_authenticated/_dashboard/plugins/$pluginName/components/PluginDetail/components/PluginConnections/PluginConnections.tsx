import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatDate } from "@superset/i18n/format";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useState } from "react";
import { LuGlobe, LuKeyRound, LuPlus, LuTrash2 } from "react-icons/lu";
import { PluginIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginIcon";
import type { AuthMethod } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginCatalog";
import { usePluginConnections } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginConnections";
import { useAuthMethodLabel } from "../../hooks/useAuthMethodLabel";
import { SectionHeader } from "../SectionHeader";

export function PluginConnections({
	pluginName,
	displayName,
	auth,
	installed,
	onAdd,
	onRemove,
	isBusy,
}: {
	pluginName: string;
	displayName: string;
	auth?: readonly AuthMethod[];
	installed: boolean;
	onAdd: () => Promise<boolean>;
	onRemove: () => void;
	isBusy: boolean;
}) {
	const { t } = useLingui();
	const methodLabel = useAuthMethodLabel();
	const {
		connections,
		isLoading,
		connectOAuth,
		connectApiKey,
		isConnecting,
		connectError,
		disconnect,
		isDisconnecting,
	} = usePluginConnections(pluginName);
	const [values, setValues] = useState<Record<string, string>>({});

	const methods = auth ?? [];
	const [method, setMethod] = useState<AuthMethod["type"]>(
		methods[0]?.type ?? "oauth2",
	);

	const selected = methods.find((entry) => entry.type === method);
	const inputs = selected?.inputs ?? [];
	const missingRequired = inputs.some(
		(input) => input.required && !values[input.name]?.trim(),
	);
	const connected = connections.length > 0;

	const authenticate = async () => {
		try {
			if (!(await onAdd())) return;
		} catch {
			return;
		}
		if (method === "api_key") {
			connectApiKey(values);
			return;
		}

		connectOAuth(
			Object.fromEntries(
				inputs
					.filter((input) => !input.secret && values[input.name])
					.map((input) => [input.name, values[input.name] as string]),
			),
			method,
		);
	};

	return (
		<section className="mt-10 flex flex-col">
			<SectionHeader
				label={<Trans>Connections</Trans>}
				count={connections.length}
			/>

			{connections.map((connection) => (
				<div key={connection.id} className="flex items-center gap-3 py-3">
					<PluginIcon pluginName={pluginName} className="size-8" />
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium text-foreground">
							{connection.account ?? displayName}
						</div>
						<p className="text-xs text-muted-foreground">
							<Trans>
								connected {formatDate(new Date(connection.createdAt))}
							</Trans>
						</p>
					</div>
					<Badge variant="outline" className="gap-1.5">
						<span className="size-1.5 rounded-full bg-success" />
						<Trans>Connected</Trans>
					</Badge>
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-destructive"
						disabled={isDisconnecting}
						aria-label={t({
							message: `Disconnect ${connection.account ?? displayName}`,
						})}
						onClick={() => disconnect(connection.id)}
					>
						<LuTrash2 className="size-4" />
					</Button>
				</div>
			))}

			{methods.length === 0 && (
				<div className="mt-4 rounded-lg border border-border/60 p-4">
					<div className="flex items-center justify-between gap-4">
						<p className="text-sm text-muted-foreground">
							<Trans>
								This plugin needs no account — its skills are ready to use.
							</Trans>
						</p>
						{installed ? (
							<Button
								variant="outline"
								size="sm"
								className="shrink-0 text-destructive"
								disabled={isBusy || isConnecting || isDisconnecting}
								onClick={onRemove}
							>
								<LuTrash2 className="size-4" />
								<Trans>Remove</Trans>
							</Button>
						) : (
							<Button
								size="sm"
								className="shrink-0"
								disabled={isBusy}
								onClick={() => void onAdd()}
							>
								<LuPlus className="size-4" />
								<Trans>Add plugin</Trans>
							</Button>
						)}
					</div>
				</div>
			)}

			{methods.length > 0 && installed && (
				<div className="mt-6 flex justify-end">
					<Button
						variant="outline"
						size="sm"
						className="shrink-0 text-destructive"
						disabled={isBusy || isConnecting || isDisconnecting}
						onClick={onRemove}
					>
						<LuTrash2 className="size-4" />
						<Trans>Remove</Trans>
					</Button>
				</div>
			)}

			{methods.length > 0 && !connected && !isLoading && (
				<div className="mt-4 rounded-lg border border-border/60 p-4">
					{/* A select with one option is a control that cannot be used —
					    it only appears once a plugin actually offers a choice. The
					    single-method case states the fact under Information instead. */}
					{methods.length > 1 && (
						<div className="mb-4 flex items-center justify-between gap-4 border-b border-border/60 pb-4">
							<label
								htmlFor={`${pluginName}-auth-method`}
								className="text-sm text-foreground"
							>
								<Trans>Authentication</Trans>
							</label>
							<Select
								value={method}
								onValueChange={(next) => {
									setValues({});
									setMethod(next as AuthMethod["type"]);
								}}
							>
								<SelectTrigger
									id={`${pluginName}-auth-method`}
									className="w-52"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{methods.map((entry) => (
										<SelectItem key={entry.type} value={entry.type}>
											{entry.label ?? methodLabel(entry.type)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{inputs.length > 0 && (
						<div className="mb-4 flex flex-col gap-3">
							{inputs.map((input) => {
								const fieldId = `${pluginName}-${input.name}`;
								return (
									<div key={input.name} className="flex flex-col gap-1.5">
										<label
											htmlFor={fieldId}
											className="text-xs font-medium text-foreground"
										>
											{input.label ?? input.name}
										</label>
										<Input
											id={fieldId}
											type={input.secret ? "password" : "text"}
											placeholder={input.placeholder}
											value={values[input.name] ?? ""}
											onChange={(event) =>
												setValues((current) => ({
													...current,
													[input.name]: event.target.value,
												}))
											}
										/>
									</div>
								);
							})}
						</div>
					)}

					<div>
						<Button
							className="w-full"
							disabled={missingRequired || isConnecting || isBusy}
							onClick={() => void authenticate()}
						>
							{method === "api_key" ? (
								<LuKeyRound className="size-4" />
							) : (
								<LuGlobe className="size-4" />
							)}
							<Trans>Authenticate your {displayName} account</Trans>
						</Button>
					</div>

					{connectError && (
						<p className="mt-3 text-xs text-destructive">
							{errorMessage(connectError)}
						</p>
					)}
				</div>
			)}
		</section>
	);
}
