"use client";

import { msg } from "@lingui/core/macro";
import { i18n } from "../../../../../../lib/i18n";
import { PIN_SIZE, type PinPoint, STACK_OFFSET } from "../../utils/pinLayout";
import { pinClassName } from "./pinClassName";

interface CommentBubbleProps {
	point: PinPoint;
	stackIndex?: number;
	initials: string;
	count: number;
	resolved: boolean;
	active: boolean;
	onClick: () => void;
}

export function CommentBubble({
	point,
	stackIndex = 0,
	initials,
	count,
	resolved,
	active,
	onClick,
}: CommentBubbleProps) {
	return (
		<button
			type="button"
			data-comment-ui=""
			onClick={onClick}
			style={{
				transform: `translate(${point.x - PIN_SIZE / 2 + stackIndex * STACK_OFFSET}px, ${point.y - PIN_SIZE / 2}px)`,
				zIndex: stackIndex,
			}}
			className={pinClassName({ resolved, active, interactive: true })}
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
