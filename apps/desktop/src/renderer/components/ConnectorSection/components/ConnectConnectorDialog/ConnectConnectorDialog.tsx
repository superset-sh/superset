import { Trans, useLingui } from "@lingui/react/macro";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import type { ReactNode } from "react";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { ConnectorSection } from "../../ConnectorSection";
import { useConnector } from "../../hooks/useConnector";

interface ConnectConnectorDialogProps {
	slug: string | null;
	icon?: ReactNode;
	author?: string | null;
	organizationId?: string | null;
	onOpenChange: (open: boolean) => void;
}

export function ConnectConnectorDialog({
	slug,
	icon,
	author,
	organizationId,
	onOpenChange,
}: ConnectConnectorDialogProps) {
	return (
		<Dialog open={Boolean(slug)} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				{slug && (
					<DialogBody
						slug={slug}
						icon={icon}
						author={author}
						organizationId={organizationId}
						onConnected={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function DialogBody({
	slug,
	icon,
	author,
	organizationId,
	onConnected,
}: {
	slug: string;
	icon?: ReactNode;
	author?: string | null;
	organizationId?: string | null;
	onConnected: () => void;
}) {
	const { t } = useLingui();
	const supersetIcon = usePresetIcon("superset");
	const { connector } = useConnector(slug, organizationId);
	const name = connector?.displayName ?? slug;

	return (
		<>
			<DialogHeader className="items-center gap-1 text-center sm:text-center">
				<div className="mb-2 flex items-center justify-center gap-2.5">
					{supersetIcon && (
						<img
							src={supersetIcon}
							alt=""
							className="size-12 rounded-xl object-cover"
						/>
					)}
					<span
						aria-hidden="true"
						className="text-xs tracking-[0.2em] text-muted-foreground"
					>
						•••
					</span>
					{icon}
				</div>
				<DialogTitle className="text-xl">
					{t({ message: `Connect ${name}` })}
				</DialogTitle>
				<DialogDescription>
					{author ? (
						t({ message: `Developed by ${author}` })
					) : (
						<Trans>Authorize Superset to act on your behalf.</Trans>
					)}
				</DialogDescription>
			</DialogHeader>

			<div className="divide-y divide-border/40 rounded-xl border border-border/60">
				<TrustItem
					title={<Trans>You control the access</Trans>}
					body={
						<Trans>
							Superset only receives the permissions this connector asks for.
							Disconnect at any time to revoke them.
						</Trans>
					}
				/>
				<TrustItem
					title={<Trans>Credentials stay on the server</Trans>}
					body={
						<Trans>
							Tokens are held by Superset and attached to requests there. They
							are never written into your local agent config.
						</Trans>
					}
				/>
				<TrustItem
					title={<Trans>Connectors carry risk</Trans>}
					body={t({
						message: `Connecting lets your agents read and act in ${name} on your behalf. Review what you are granting before you continue.`,
					})}
				/>
			</div>

			<ConnectorSection
				slug={slug}
				organizationId={organizationId}
				onConnected={onConnected}
			/>
		</>
	);
}

function TrustItem({ title, body }: { title: ReactNode; body: ReactNode }) {
	return (
		<div className="px-4 py-3">
			<div className="text-sm font-medium text-foreground">{title}</div>
			<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
				{body}
			</p>
		</div>
	);
}
