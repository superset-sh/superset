import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { LuKeyRound } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CHIP, CHIP_EMPTY } from "../../../TriggerSentence/chipStyles";
import { EndpointChip } from "../../../TriggerSentence/components/EndpointChip";

interface WebhookSentenceProps {
	triggerId?: string;
	disabled?: boolean;
}

/** "Webhook triggered" + inbound URL + auth header button. The token is shown once. */
export function WebhookSentence({ triggerId, disabled }: WebhookSentenceProps) {
	const { automationId } = useParams({ strict: false });
	const url = automationId
		? `${env.NEXT_PUBLIC_API_URL}/api/automations/webhook/${automationId}`
		: null;

	const automation = cloudTrpc.automation.get.useQuery(
		{ id: automationId ?? "" },
		{ enabled: Boolean(automationId) },
	);
	const utils = cloudTrpc.useUtils();
	const secretPrefix = automation.data?.triggers.find(
		(t) => t.id === triggerId,
	)?.secretPrefix;

	const [token, setToken] = useState<string | null>(null);
	const rotate = useMutation({
		mutationFn: (id: string) =>
			apiTrpcClient.automation.rotateWebhookSecret.mutate({ triggerId: id }),
		onSuccess: (result) => {
			setToken(result.token);
			if (automationId) {
				void utils.automation.get.invalidate({ id: automationId });
			}
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to generate token",
			),
	});

	const copyHeader = () =>
		navigator.clipboard.writeText(`Authorization: Bearer ${token}`).then(
			() => toast.success("Auth header copied"),
			() => toast.error("Copy failed"),
		);

	const generate = () => {
		if (!triggerId) return;
		if (!secretPrefix) {
			rotate.mutate(triggerId);
			return;
		}
		alert({
			title: "Regenerate auth header?",
			description: `The current token (${secretPrefix}…) stops working immediately.`,
			actions: [
				{ label: "Cancel", variant: "outline", onClick: () => {} },
				{
					label: "Regenerate",
					variant: "destructive",
					onClick: () => rotate.mutate(triggerId),
				},
			],
		});
	};

	const headerLabel = token
		? "Copy auth header"
		: secretPrefix
			? "Regenerate auth header"
			: "Generate auth header";

	return (
		<>
			<span className="text-[13px] text-muted-foreground">
				Webhook triggered
			</span>
			<EndpointChip url={url} />
			<Tooltip>
				<TooltipTrigger asChild>
					<span>
						<button
							type="button"
							disabled={disabled || !triggerId || rotate.isPending}
							onClick={() => (token ? copyHeader() : generate())}
							className={cn(CHIP, !token && !secretPrefix && CHIP_EMPTY)}
						>
							<LuKeyRound className="size-3 shrink-0 opacity-50" />
							<span className="truncate">
								{rotate.isPending ? "Generating..." : headerLabel}
							</span>
						</button>
					</span>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{!triggerId
						? "Save triggers first"
						: token
							? "Copies the Authorization header. It is only shown now."
							: secretPrefix
								? `Token ${secretPrefix}… is set. Regenerating replaces it.`
								: "Issues a bearer token for this trigger."}
				</TooltipContent>
			</Tooltip>
		</>
	);
}
