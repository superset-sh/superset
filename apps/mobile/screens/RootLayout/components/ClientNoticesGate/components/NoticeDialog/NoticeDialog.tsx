import { Trans } from "@lingui/react/macro";
import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { StreamdownText } from "react-native-streamdown";
import { MESSAGE_MARKDOWN_STYLE } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";

interface NoticeDialogProps {
	notice: DesktopNotice;
	onClose: () => void;
	onCta: () => void;
}

export function NoticeDialog({ notice, onClose, onCta }: NoticeDialogProps) {
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogTitle>
					<Trans>Notice</Trans>
				</DialogTitle>
				<StreamdownText
					markdown={notice.body}
					markdownStyle={MESSAGE_MARKDOWN_STYLE}
				/>
				<DialogFooter className="flex-row justify-end">
					<Button variant="ghost" onPress={onClose}>
						<Text>
							<Trans>Dismiss</Trans>
						</Text>
					</Button>
					{notice.cta && (
						<Button onPress={onCta}>
							<Text>{notice.cta.label}</Text>
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
