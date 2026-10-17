import { Trans } from "@lingui/react/macro";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import type { ReactNode } from "react";

export function AccountTerminalDialogFrame({
	launching,
	onClose,
	returnFocus,
	children,
}: {
	launching: boolean;
	onClose: () => void;
	returnFocus: HTMLElement | null;
	children: ReactNode;
}) {
	return (
		<Dialog
			modal
			open
			onOpenChange={(open) => !open && !launching && onClose()}
		>
			<DialogContent
				className="sm:max-w-md"
				showCloseButton={!launching}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					if (!launching && returnFocus?.isConnected) returnFocus.focus();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						<Trans>Agent terminal with account</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Start a new terminal using an existing login. Other chats and your
							default account stay unchanged.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				{children}
			</DialogContent>
		</Dialog>
	);
}
