"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
	accountIdentity,
	accountLabels,
} from "@superset/shared/account-labels";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface MethodSummary {
	type: "oauth2" | "api_key" | "app_install" | "admin_consent";
	label: string;
	inputs: readonly {
		name: string;
		label?: string;
		placeholder?: string;
		description?: string;
		required: boolean;
		secret: boolean;
	}[];
}

interface ConnectorConnectProps {
	slug: string;
	displayName: string;
	organizationId: string;
	methods: readonly MethodSummary[];
	scope: "user" | "org";
	connections: readonly {
		id: string;
		externalAccountLabel: string | null;
		externalUserLabel: string | null;
		needsReauth: boolean;
	}[];
}

/** Nickname first, then whatever the provider called it. Never the id. */
function initials(label: string): string {
	const parts = label
		.trim()
		.split(/[\s@._-]+/)
		.filter(Boolean);
	return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export function ConnectorConnect({
	slug,
	displayName: name,
	organizationId,
	methods,
	scope,
	connections,
}: ConnectorConnectProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { t } = useLingui();

	const [selected, setSelected] = useState(methods[0]?.type ?? "oauth2");
	const [values, setValues] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: trpc.connectors.status.queryKey({ organizationId }),
		});
		router.refresh();
	};

	const connectApiKey = useMutation(
		trpc.connectors.connectApiKey.mutationOptions({
			onSuccess: invalidate,
			onError: (e) => setError(e.message),
		}),
	);

	const disconnect = useMutation(
		trpc.connectors.disconnect.mutationOptions({ onSuccess: invalidate }),
	);

	const method = methods.find((m) => m.type === selected) ?? methods[0];

	// Declared above the account list because a Reconnect row calls it; the
	// callback re-runs the same grant, and the callback's upsert lands on the
	// same row because it conflicts on the external account id.
	const redirect = () => {
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/connectors/${slug}/connect?organizationId=${organizationId}&method=${method?.type ?? "oauth2"}`;
	};

	const [addingAccount, setAddingAccount] = useState(false);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [draftName, setDraftName] = useState("");

	const rename = useMutation(
		trpc.connectors.rename.mutationOptions({
			onSuccess: () => {
				setRenaming(null);
				invalidate();
			},
			onError: (e) => setError(e.message),
		}),
	);

	const connected = connections.length > 0 && (
		<div className="divide-y divide-border overflow-hidden rounded-lg border">
			{connections.map((connection) => {
				const { title, subtitle } = accountLabels(connection, name);
				const identity = accountIdentity(connection);

				if (renaming === connection.id) {
					return (
						<form
							key={connection.id}
							className="space-y-2 p-3"
							onSubmit={(e) => {
								e.preventDefault();
								const label = draftName.trim();
								if (!label) return;
								rename.mutate({
									organizationId,
									connectionId: connection.id,
									label,
								});
							}}
						>
							<p className="text-muted-foreground text-xs">{identity}</p>
							<Input
								autoFocus
								value={draftName}
								maxLength={64}
								placeholder={t({ message: "Nickname" })}
								onChange={(e) => setDraftName(e.target.value)}
							/>
							<div className="flex gap-2">
								<Button type="submit" size="sm" disabled={rename.isPending}>
									<Trans>Save</Trans>
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => setRenaming(null)}
								>
									<Trans>Cancel</Trans>
								</Button>
							</div>
						</form>
					);
				}

				return (
					<div key={connection.id} className="flex items-center gap-3 p-3">
						<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
							{initials(title)}
						</span>
						<div className="min-w-0 flex-1">
							<div className="truncate font-medium text-sm">{title}</div>
							{connection.needsReauth ? (
								<p className="text-amber-600 text-xs dark:text-amber-500">
									<Trans>Reconnect required</Trans>
								</p>
							) : (
								subtitle && (
									<p className="truncate text-muted-foreground text-xs">
										{subtitle}
									</p>
								)
							)}
						</div>
						{connection.needsReauth && (
							<Button size="sm" variant="outline" onClick={redirect}>
								<Trans>Reconnect</Trans>
							</Button>
						)}
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								setRenaming(connection.id);
								setDraftName(connection.externalUserLabel ?? "");
							}}
						>
							<Trans>Rename</Trans>
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={disconnect.isPending}
							aria-label={t({ message: `Disconnect ${title}` })}
							onClick={() =>
								disconnect.mutate({
									organizationId,
									connectionId: connection.id,
								})
							}
						>
							<Unplug className="size-4" />
						</Button>
					</div>
				);
			})}
		</div>
	);

	// An org-scoped connector is the organization's one account; the unique
	// index refuses a second, so offering it would only fail.
	if (connections.length > 0 && !addingAccount) {
		return (
			<div className="space-y-3">
				{connected}
				{scope === "user" && (
					<Button
						variant="outline"
						className="w-full"
						onClick={() => {
							setError(null);
							setAddingAccount(true);
						}}
					>
						<Plus className="mr-2 size-4" />
						<Trans>Connect another account</Trans>
					</Button>
				)}
				{error && <p className="text-destructive text-sm">{error}</p>}
			</div>
		);
	}

	if (!method) return null;

	return (
		<div className="space-y-4">
			{connected}

			{/* Answers "should I grant this?", which is decided once. Shown only
			    before the first grant, like the desktop dialog — this screen is
			    reached from a share link, where the person may not know what
			    Superset is about to be allowed to do. */}
			{connections.length === 0 && (
				<div className="divide-y divide-border rounded-lg border">
					<div className="px-4 py-3">
						<div className="font-medium text-sm">
							<Trans>You control the access</Trans>
						</div>
						<p className="mt-0.5 text-muted-foreground text-xs">
							<Trans>
								Superset only receives the permissions this connector asks for.
								Disconnect at any time to revoke them.
							</Trans>
						</p>
					</div>
					<div className="px-4 py-3">
						<div className="font-medium text-sm">
							<Trans>Credentials stay on the server</Trans>
						</div>
						<p className="mt-0.5 text-muted-foreground text-xs">
							<Trans>
								Tokens are held by Superset and attached to requests there. They
								are never written into your local agent config.
							</Trans>
						</p>
					</div>
					<div className="px-4 py-3">
						<div className="font-medium text-sm">
							<Trans>Connectors carry risk</Trans>
						</div>
						<p className="mt-0.5 text-muted-foreground text-xs">
							{t({
								message: `Connecting lets your agents read and act in ${name} on your behalf. Review what you are granting before you continue.`,
							})}
						</p>
					</div>
				</div>
			)}

			{methods.length > 1 && (
				<div className="flex gap-2">
					{methods.map((m) => (
						<Button
							key={m.type}
							type="button"
							size="sm"
							variant={m.type === selected ? "default" : "outline"}
							onClick={() => {
								setSelected(m.type);
								setError(null);
							}}
						>
							{m.label}
						</Button>
					))}
				</div>
			)}

			{method.type === "api_key" ? (
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						connectApiKey.mutate({ organizationId, slug, inputs: values });
					}}
				>
					{method.inputs.map((field) => (
						<div key={field.name} className="space-y-1.5">
							<Label htmlFor={field.name}>{field.label ?? field.name}</Label>
							<Input
								id={field.name}
								type={field.secret ? "password" : "text"}
								placeholder={field.placeholder}
								required={field.required}
								value={values[field.name] ?? ""}
								onChange={(e) =>
									setValues({ ...values, [field.name]: e.target.value })
								}
							/>
							{field.description && (
								<p className="text-xs text-muted-foreground">
									{field.description}
								</p>
							)}
						</div>
					))}
					<Button type="submit" disabled={connectApiKey.isPending}>
						{connectApiKey.isPending ? (
							<Trans>Connecting…</Trans>
						) : (
							t({ message: `Connect ${name}` })
						)}
					</Button>
				</form>
			) : (
				<Button onClick={redirect}>{t({ message: `Connect ${name}` })}</Button>
			)}

			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}
