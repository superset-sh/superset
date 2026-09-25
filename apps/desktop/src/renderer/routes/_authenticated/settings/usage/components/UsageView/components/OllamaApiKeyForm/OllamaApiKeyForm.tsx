import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

/**
 * Ollama Cloud API key entry, shown in place of the quota section while no
 * key is stored, and as an inline form to rotate the key when one is already
 * configured. The key itself never comes back from the host — reads only
 * report whether one is configured.
 */
export function OllamaApiKeyForm({
	hostUrl,
	onKeyChanged,
}: {
	hostUrl: string | null;
	onKeyChanged: () => void;
}) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const [keyInput, setKeyInput] = useState("");
	const [isChanging, setIsChanging] = useState(false);

	const keyQuery = useQuery({
		queryKey: ["host-ollama-key", hostUrl] as const,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(hostUrl).settings.ollama.get.query();
		},
	});

	const invalidate = () => {
		void queryClient.invalidateQueries({
			queryKey: ["host-ollama-key", hostUrl],
		});
		onKeyChanged();
	};

	const setKeyMutation = useMutation({
		mutationFn: (key: string) => {
			if (!hostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(hostUrl).settings.ollama.setKey.mutate(
				{ key },
			);
		},
		onSuccess: () => {
			setKeyInput("");
			setIsChanging(false);
			invalidate();
		},
		onError: (err) =>
			toast.error(
				errorMessage(
					err,
					t({
						message: "Failed to save Ollama API key",
					}),
				),
			),
	});

	const clearKeyMutation = useMutation({
		mutationFn: () => {
			if (!hostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(hostUrl).settings.ollama.clearKey.mutate();
		},
		onSuccess: invalidate,
		onError: (err) =>
			toast.error(
				errorMessage(
					err,
					t({
						message: "Failed to remove Ollama API key",
					}),
				),
			),
	});

	if (keyQuery.data?.configured && !isChanging) {
		return (
			<div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
				<span className="flex-1">
					<Trans>Ollama Cloud API key saved on this host.</Trans>
				</span>
				<Button
					disabled={!hostUrl || clearKeyMutation.isPending || setKeyMutation.isPending}
					onClick={() => setIsChanging(true)}
					size="sm"
					variant="ghost"
				>
					<Trans>Change key</Trans>
				</Button>
				<Button
					disabled={!hostUrl || clearKeyMutation.isPending}
					onClick={() => clearKeyMutation.mutate()}
					size="sm"
					variant="ghost"
				>
					<Trans>Remove</Trans>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2">
			<p className="text-[11px] text-muted-foreground">
				{keyQuery.data?.configured ? (
					<Trans>Enter a new Ollama Cloud API key to replace the saved one.</Trans>
				) : (
					<Trans>
						Paste an Ollama Cloud API key to show usage here. The key is stored
						on this host and sent to Ollama Cloud to fetch usage.
					</Trans>
				)}
			</p>
			<div className="flex items-center gap-2">
				<Input
					autoComplete="off"
					className="h-7 text-xs"
					disabled={!hostUrl || setKeyMutation.isPending}
					onChange={(event) => setKeyInput(event.target.value)}
					placeholder={t({
						message: "Ollama Cloud API key",
					})}
					type="password"
					value={keyInput}
				/>
				<Button
					disabled={!hostUrl || keyInput.trim() === "" || setKeyMutation.isPending}
					onClick={() => setKeyMutation.mutate(keyInput.trim())}
					size="sm"
				>
					<Trans>Save</Trans>
				</Button>
				{keyQuery.data?.configured && (
					<Button
						disabled={setKeyMutation.isPending}
						onClick={() => {
							setKeyInput("");
							setIsChanging(false);
						}}
						size="sm"
						variant="ghost"
					>
						<Trans>Cancel</Trans>
					</Button>
				)}
			</div>
		</div>
	);
}
