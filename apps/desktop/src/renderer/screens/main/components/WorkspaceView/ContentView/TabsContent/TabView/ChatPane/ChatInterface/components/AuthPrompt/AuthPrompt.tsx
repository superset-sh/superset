import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function AuthPrompt() {
	const [apiKey, setApiKey] = useState("");
	const [error, setError] = useState<string | null>(null);

	const utils = electronTrpc.useUtils();
	const setApiKeyMutation = electronTrpc.aiChat.setApiKey.useMutation({
		onSuccess: () => {
			setError(null);
			void utils.aiChat.getAuthStatus.invalidate();
		},
		onError: (err) => {
			setError(err.message || "Failed to set API key");
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = apiKey.trim();
		if (!trimmed) return;
		setApiKeyMutation.mutate({ apiKey: trimmed });
	};

	return (
		<div className="flex flex-col items-center justify-center gap-4 border-t border-border px-6 py-8">
			<div className="flex flex-col items-center gap-2 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
					<KeyRound className="h-5 w-5 text-muted-foreground" />
				</div>
				<p className="text-sm font-medium text-foreground">
					Connect your Anthropic account to start chatting
				</p>
				<p className="text-xs text-muted-foreground">
					Paste your Anthropic API key or Claude OAuth token
				</p>
			</div>
			<form
				onSubmit={handleSubmit}
				className="flex w-full max-w-sm items-center gap-2"
			>
				<Input
					type="password"
					placeholder="sk-ant-..."
					value={apiKey}
					onChange={(e) => setApiKey(e.target.value)}
					className="flex-1"
					autoFocus
				/>
				<Button
					type="submit"
					size="sm"
					disabled={!apiKey.trim() || setApiKeyMutation.isPending}
				>
					{setApiKeyMutation.isPending ? "Connecting..." : "Connect"}
				</Button>
			</form>
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	);
}
