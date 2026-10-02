import { Trans, useLingui } from "@lingui/react/macro";
import {
	type AccountLabelSource,
	accountIdentity,
} from "@superset/shared/account-labels";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { useState } from "react";

const NICKNAME_MAX = 64;

export function RenameAccountDialog({
	account,
	connectorName,
	isPending,
	onOpenChange,
	onSubmit,
}: {
	account: (AccountLabelSource & { id: string }) | null;
	connectorName: string;
	isPending?: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (label: string | null) => void;
}) {
	return (
		<Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				{account && (
					<RenameForm
						key={account.id}
						account={account}
						connectorName={connectorName}
						isPending={isPending}
						onSubmit={onSubmit}
						onCancel={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function RenameForm({
	account,
	connectorName,
	isPending,
	onSubmit,
	onCancel,
}: {
	account: AccountLabelSource & { id: string };
	connectorName: string;
	isPending?: boolean;
	onSubmit: (label: string | null) => void;
	onCancel: () => void;
}) {
	const { t } = useLingui();
	const [draft, setDraft] = useState(account.externalUserLabel ?? "");

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit(draft.trim() ? draft.trim() : null);
			}}
		>
			<DialogHeader>
				<DialogTitle>
					<Trans>Rename account</Trans>
				</DialogTitle>
				<DialogDescription className="truncate">
					{accountIdentity(account) ??
						t({ message: `${connectorName} account` })}
				</DialogDescription>
			</DialogHeader>

			<Input
				autoFocus
				value={draft}
				maxLength={NICKNAME_MAX}
				placeholder={t({ message: "Nickname" })}
				aria-label={t({ message: "Nickname" })}
				onChange={(event) => setDraft(event.target.value)}
				className="my-4"
			/>

			<DialogFooter>
				<Button
					type="button"
					variant="ghost"
					onClick={onCancel}
					disabled={isPending}
				>
					<Trans>Cancel</Trans>
				</Button>
				<Button type="submit" disabled={isPending}>
					<Trans>Save</Trans>
				</Button>
			</DialogFooter>
		</form>
	);
}
