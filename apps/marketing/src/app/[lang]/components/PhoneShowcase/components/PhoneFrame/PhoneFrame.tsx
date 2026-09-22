import type { ReactNode } from "react";

interface PhoneFrameProps {
	children: ReactNode;
	className?: string;
	edge?: "left" | "right";
}

export function PhoneFrame({
	children,
	className = "",
	edge,
}: PhoneFrameProps) {
	const side = edge === "left" ? -1 : 1;
	const depthShadow = edge
		? `${side * 2}px 0 0 #141619, ${side * 5}px 0 0 #0d0f10, ${side * 6}px 0 0 #1a1d21, ${side * 7}px 0 0 #111214`
		: "0 0 0 2px #090909, 0 0 0 3px #141517";
	const rimClass =
		edge === "right"
			? "py-[5px] pr-[5px] pl-[2px]"
			: edge === "left"
				? "py-[5px] pr-[2px] pl-[5px]"
				: "p-[5px]";
	const screenRadiusClass =
		edge === "right"
			? "rounded-l-[42px] rounded-r-[39px]"
			: edge === "left"
				? "rounded-l-[39px] rounded-r-[42px]"
				: "rounded-[39px]";
	return (
		<div
			style={{
				background: edge
					? `radial-gradient(ellipse 12px 65% at ${edge} ${edge === "left" ? "32%" : "58%"}, #34373b 0%, #1c1e21 45%, transparent 100%), #090a0b`
					: undefined,
				boxShadow: `${depthShadow}, 0 30px 80px -20px rgba(0,0,0,0.8)`,
			}}
			className={`relative aspect-[9/19] w-[264px] rounded-[44px] border border-white/[0.025] bg-[linear-gradient(115deg,#090a0b_0%,#232529_22%,#0a0b0c_42%,#101113_76%,#282a2e_100%)] ${rimClass} ${className}`}
		>
			{edge ? (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute top-[44px] bottom-[44px] w-[7px]"
					style={{
						[edge]: -7,
						background: `linear-gradient(${edge === "left" ? "180deg" : "0deg"}, #111214 0%, #1a1d21 18%, #131518 38%, #0b0d0e 56%, #191b1f 78%, #111214 100%)`,
					}}
				/>
			) : null}
			<div
				className={`relative flex h-full flex-col overflow-hidden bg-[#0b0b0b] text-white ${screenRadiusClass}`}
			>
				<div className="flex shrink-0 items-center justify-between px-7 pt-3.5 pb-2">
					<span className="font-semibold text-[11px]">9:41</span>
					<span className="absolute top-2.5 left-1/2 h-[22px] w-[78px] -translate-x-1/2 rounded-full bg-black" />
					<span className="flex items-center gap-1">
						<span className="h-[7px] w-[11px] rounded-[2px] bg-white/80" />
						<span className="h-[9px] w-[18px] rounded-[3px] border border-white/50 p-px">
							<span className="block h-full w-3/4 rounded-[1.5px] bg-emerald-400" />
						</span>
					</span>
				</div>
				{children}
			</div>
		</div>
	);
}
