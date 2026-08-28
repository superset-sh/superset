import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
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
	const { t } = useLingui();
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
				errorMessage(
					error,
					t({
						id: "dashboard.automations.webhookSentence.generateTokenFailedToast",
						message: "Failed to generate token",
					}),
				),
			),
	});

	const copyHeader = () =>
		navigator.clipboard.writeText(`Authorization: Bearer ${token}`).then(
			() =>
				toast.success(
					t({
						id: "dashboard.automations.webhookSentence.headerCopiedToast",
						message: "Auth header copied",
					}),
				),
			() =>
				toast.error(
					t({
						id: "dashboard.automations.webhookSentence.copyFailedToast",
						message: "Copy failed",
					}),
				),
		);

	const generate = () => {
		if (!triggerId) return;
		if (!secretPrefix) {
			rotate.mutate(triggerId);
			return;
		}
		alert({
			title: t({
				id: "dashboard.automations.webhookSentence.regenerateDialogTitle",
				message: "Regenerate auth header?",
			}),
			description: t({
				id: "dashboard.automations.webhookSentence.regenerateDialogDescription",
				message: `The current token (${secretPrefix}…) stops working immediately.`,
			}),
			actions: [
				{
					label: t({
						id: "dashboard.automations.webhookSentence.regenerateDialogCancel",
						message: "Cancel",
					}),
					variant: "outline",
					onClick: () => {},
				},
				{
					label: t({
						id: "dashboard.automations.webhookSentence.regenerateDialogConfirm",
						message: "Regenerate",
					}),
					variant: "destructive",
					onClick: () => rotate.mutate(triggerId),
				},
			],
		});
	};

	const headerLabel = token
		? t({
				id: "dashboard.automations.webhookSentence.copyAuthHeader",
				message: "Copy auth header",
			})
		: secretPrefix
			? t({
					id: "dashboard.automations.webhookSentence.regenerateAuthHeader",
					message: "Regenerate auth header",
				})
			: t({
					id: "dashboard.automations.webhookSentence.generateAuthHeader",
					message: "Generate auth header",
				});

	return (
		<>
			<span className="text-[13px] text-muted-foreground">
				<Trans id="dashboard.automations.webhookSentence.webhookTriggered">
					Webhook triggered
				</Trans>
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
								{rotate.isPending ? (
									<Trans id="dashboard.automations.webhookSentence.generating">
										Generating...
									</Trans>
								) : (
									headerLabel
								)}
							</span>
						</button>
					</span>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{!triggerId ? (
						<Trans id="dashboard.automations.webhookSentence.saveTriggersFirst">
							Save triggers first
						</Trans>
					) : token ? (
						<Trans id="dashboard.automations.webhookSentence.copiesHeaderTooltip">
							Copies the Authorization header. It is only shown now.
						</Trans>
					) : secretPrefix ? (
						<Trans id="dashboard.automations.webhookSentence.tokenSetTooltip">
							Token {secretPrefix}… is set. Regenerating replaces it.
						</Trans>
					) : (
						<Trans id="dashboard.automations.webhookSentence.issuesTokenTooltip">
							Issues a bearer token for this trigger.
						</Trans>
					)}
				</TooltipContent>
			</Tooltip>
		</>
	);
}
