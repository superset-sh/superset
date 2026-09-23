"use client";

import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { PhoneFrame } from "../PhoneFrame";
import { ReviewScreen } from "../ReviewScreen";
import { SessionScreen } from "../SessionScreen";
import { WorkspacesScreen } from "../WorkspacesScreen";

export function SpreadPhones() {
	const ref = useRef<HTMLDivElement>(null);
	const reducedMotion = useReducedMotion();
	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start 95%", "start 30%"],
	});
	const leftX = useTransform(scrollYProgress, [0, 1], [292, 0]);
	const rightX = useTransform(scrollYProgress, [0, 1], [-292, 0]);

	return (
		<div
			ref={ref}
			aria-hidden="true"
			className="@container pointer-events-none relative h-[396px] select-none text-left sm:h-[min(64.8cqw,648px)]"
		>
			<div className="absolute left-1/2 flex w-[880px] origin-top -translate-x-1/2 items-start justify-center gap-7 [transform:scale(0.648)] sm:[transform:scale(min(1.08,calc(90cqw/880px)))]">
				<m.div
					className="relative z-0 shrink-0"
					style={{ x: reducedMotion ? 0 : leftX }}
				>
					<PhoneFrame
						edge="right"
						className="mt-3 [transform:perspective(1000px)_rotateY(-30deg)_scale(0.88)]"
					>
						<WorkspacesScreen />
					</PhoneFrame>
				</m.div>
				<PhoneFrame className="relative z-10 shrink-0">
					<SessionScreen />
				</PhoneFrame>
				<m.div
					className="relative z-0 shrink-0"
					style={{ x: reducedMotion ? 0 : rightX }}
				>
					<PhoneFrame
						edge="left"
						className="mt-3 [transform:perspective(1000px)_rotateY(30deg)_scale(0.88)]"
					>
						<ReviewScreen />
					</PhoneFrame>
				</m.div>
			</div>
		</div>
	);
}
