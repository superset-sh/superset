"use client";

import { msg } from "@lingui/core/macro";
import { i18n } from "../../../../../../lib/i18n";
import type { CommentIntent } from "../../../../providers/CommentProvider";
import { type PinPoint, pinTransform } from "../../utils/pinLayout";
import { pinClassName } from "./pinClassName";

interface CommentBubbleProps {
	point: PinPoint;
	stackIndex?: number;
	initials: string;
	count: number;
	resolved: boolean;
	intent?: CommentIntent | null;
	active: boolean;
	onClick: () => void;
}

export function CommentBubble({
	point,
	stackIndex = 0,
	initials,
	count,
	resolved,
	intent,
	active,
	onClick,
}: CommentBubbleProps) {
	return (
		<button
			type="button"
			data-comment-ui=""
			onClick={onClick}
			style={{
				transform: pinTransform(point, stackIndex),
				zIndex: stackIndex,
			}}
			className={pinClassName({ resolved, active, intent, interactive: true })}
			aria-label={i18n._({
				...msg({
					message: "{count, plural, one {# comment} other {# comments}}",
				}),
				values: { count },
			})}
		>
			{count > 1 ? count : initials}
		</button>
	);
}
