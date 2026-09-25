"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Unplug } from "lucide-react";
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
	connection: {
		id: string;
		externalAccountLabel: string | null;
		externalUserLabel: string | null;
	} | null;
}

export function ConnectorConnect({
	slug,
	displayName,
	organizationId,
	methods,
	connection,
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

	if (connection) {
		const who = connection.externalUserLabel;
		const where = connection.externalAccountLabel;
		return (
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Badge variant="default" className="gap-1">
						<CheckCircle2 className="size-3" />
						<Trans>Connected</Trans>
					</Badge>
					<span className="text-sm text-muted-foreground">
						{who && where ? `${who} · ${where}` : (who ?? where ?? "")}
					</span>
				</div>
				<Button
					variant="outline"
					disabled={disconnect.isPending}
					onClick={() =>
						disconnect.mutate({ organizationId, connectionId: connection.id })
					}
				>
					<Unplug className="mr-2 size-4" />
					<Trans>Disconnect</Trans>
				</Button>
			</div>
		);
	}

	const method = methods.find((m) => m.type === selected) ?? methods[0];
	if (!method) return null;

	const redirect = () => {
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/connectors/${slug}/connect?organizationId=${organizationId}&method=${method.type}`;
	};

	return (
		<div className="space-y-4">
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
							t({ message: `Connect ${displayName}` })
						)}
					</Button>
				</form>
			) : (
				<Button onClick={redirect}>
					{t({ message: `Connect ${displayName}` })}
				</Button>
			)}

			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}
