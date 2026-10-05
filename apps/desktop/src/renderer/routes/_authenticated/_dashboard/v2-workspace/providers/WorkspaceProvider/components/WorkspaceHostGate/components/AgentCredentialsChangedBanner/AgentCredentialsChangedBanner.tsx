import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LuTriangleAlert } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export function AgentCredentialsChangedBanner({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const restart = useMutation({
		mutationFn: () =>
			apiTrpcClient.cloudWorkspace.restart.mutate({ id: workspaceId }),
		onSuccess: () =>
			Promise.all(
				(["access", "wake"] as const).map((kind) =>
					queryClient.invalidateQueries({
						queryKey: ["cloud-workspace", kind, workspaceId],
					}),
				),
			),
		onError: (error) => {
			toast.error(
				t({
					message: `Couldn't restart the workspace: ${errorMessage(error)}`,
				}),
			);
		},
	});

	return (
		<div
			aria-live="polite"
			className="flex shrink-0 items-center gap-3 border-t border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground/85"
		>
			<LuTriangleAlert
				className="size-4 shrink-0 text-foreground/85"
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 truncate">
				{t({ message: "Agent credentials changed" })}
			</span>
			<button
				type="button"
				disabled={restart.isPending}
				onClick={() => restart.mutate()}
				className="shrink-0 rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-warning/20 disabled:opacity-60"
			>
				{restart.isPending
					? t({ message: "Restarting…" })
					: t({ message: "Restart workspace" })}
			</button>
		</div>
	);
}
