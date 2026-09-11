"use client";

import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { ThumbsUp, Trash2, X, Zap } from "lucide-react";
import { useState } from "react";
import type { CommentIntent } from "../../../../../../providers/CommentProvider";
import {
	APPROVE_BODY,
	APPROVE_INTENT,
	DELETE_BODY,
	DELETE_INTENT,
} from "../../constants";
import { ComposerActionButton } from "../ComposerActionButton";
import { FastMenu } from "../FastMenu";

interface ComposerActionsProps {
	onQuick: (body: MessageDescriptor, intent?: CommentIntent | null) => void;
	onDismiss: () => void;
}

export function ComposerActions({ onQuick, onDismiss }: ComposerActionsProps) {
	const { t } = useLingui();
	const [menuOpen, setMenuOpen] = useState(false);

	return (
		<div className="relative flex items-center gap-0.5 border-b px-1.5 py-1.5">
			<ComposerActionButton
				label={t({ message: "Ask for this to be removed" })}
				onClick={() => onQuick(DELETE_BODY, DELETE_INTENT)}
			>
				<Trash2 className="size-4" />
			</ComposerActionButton>

			<ComposerActionButton
				label={t({ message: "Quick feedback" })}
				active={menuOpen}
				expanded={menuOpen}
				onClick={() => setMenuOpen((open) => !open)}
			>
				<Zap className="size-4" />
			</ComposerActionButton>

			<ComposerActionButton
				label={t({ message: "Looks good" })}
				onClick={() => onQuick(APPROVE_BODY, APPROVE_INTENT)}
			>
				<ThumbsUp className="size-4" />
			</ComposerActionButton>

			<div className="ml-auto">
				<ComposerActionButton
					label={t({ message: "Dismiss" })}
					onClick={onDismiss}
				>
					<X className="size-4" />
				</ComposerActionButton>
			</div>

			{menuOpen ? (
				<FastMenu
					onPick={(body) => {
						setMenuOpen(false);
						onQuick(body);
					}}
					onClose={() => setMenuOpen(false)}
				/>
			) : null}
		</div>
	);
}
