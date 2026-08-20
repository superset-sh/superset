import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { LuKeyRound } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CHIP, CHIP_EMPTY } from "../../../../TriggerSentence/chipStyles";

/**
 * Circleback issues the signing secret when the URL is pasted into its
 * automation editor, so this takes it back rather than revealing one of ours.
 * The value goes straight to the trigger row's secret column — never through
 * the config, which every member of the organization can read — and the chip
 * shows only its prefix afterwards.
 */
export function SigningSecretChip({
	triggerId,
	disabled,
}: {
	triggerId?: string;
	disabled?: boolean;
}) {
	const { automationId } = useParams({ strict: false });
	const automation = cloudTrpc.automation.get.useQuery(
		{ id: automationId ?? "" },
		{ enabled: Boolean(automationId) },
	);
	const utils = cloudTrpc.useUtils();
	const secretPrefix = automation.data?.triggers.find(
		(t) => t.id === triggerId,
	)?.secretPrefix;

	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState("");

	const save = useMutation({
		mutationFn: (secret: string) =>
			apiTrpcClient.automation.setTriggerSecret.mutate({
				triggerId: triggerId ?? "",
				secret,
			}),
		onSuccess: () => {
			setDraft("");
			setOpen(false);
			toast.success("Signing secret saved");
			if (automationId) {
				void utils.automation.get.invalidate({ id: automationId });
			}
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to save secret",
			),
	});

	const submit = () => {
		const secret = draft.trim();
		if (!secret || save.isPending) return;
		save.mutate(secret);
	};

	return (
		<Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
			<PopoverTrigger asChild>
				<span>
					<button
						type="button"
						disabled={disabled || !triggerId}
						title={triggerId ? undefined : "Save triggers first"}
						className={cn(CHIP, !secretPrefix && CHIP_EMPTY)}
					>
						<LuKeyRound className="size-3 shrink-0 opacity-50" />
						<span className="truncate">
							{secretPrefix ? `${secretPrefix}…` : "Signing secret"}
						</span>
					</button>
				</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-2">
				<div className="flex items-center gap-1.5">
					<Input
						autoFocus
						value={draft}
						placeholder="Paste the whsec_… secret from Circleback"
						disabled={save.isPending}
						autoComplete="off"
						spellCheck={false}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") submit();
						}}
						className="h-8 font-mono text-[13px]"
					/>
					<Button
						type="button"
						size="sm"
						onClick={submit}
						disabled={!draft.trim() || save.isPending}
						className="h-8 shrink-0 text-[13px]"
					>
						{save.isPending ? "Saving..." : "Save"}
					</Button>
				</div>
				<p className="mt-1.5 px-1 text-[12px] text-muted-foreground">
					{secretPrefix
						? `${secretPrefix}… is set. Saving a new one replaces it.`
						: "Circleback shows this when you paste the URL into its automation. Deliveries are rejected until it is set."}
				</p>
			</PopoverContent>
		</Popover>
	);
}
