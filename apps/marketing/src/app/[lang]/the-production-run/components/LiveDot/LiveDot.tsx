interface LiveDotProps {
	rgb: string;
	className?: string;
}

export function LiveDot({ rgb, className = "" }: LiveDotProps) {
	return (
		<span
			className={`relative inline-flex h-2 w-2 shrink-0 ${className}`}
			aria-hidden="true"
		>
			<style>{`
				@keyframes live-dot-halo {
					0%   { transform: scale(1);   opacity: 0.55; }
					70%  { transform: scale(2.8); opacity: 0; }
					100% { transform: scale(2.8); opacity: 0; }
				}
				.live-dot-halo { animation: live-dot-halo 2.4s cubic-bezier(0, 0, 0.2, 1) infinite; }
				@media (prefers-reduced-motion: reduce) {
					.live-dot-halo { animation: none; opacity: 0.35; transform: scale(1.8); }
				}
			`}</style>
			<span
				className="live-dot-halo absolute inline-flex h-full w-full rounded-full"
				style={{ background: `rgb(${rgb})` }}
			/>
			<span
				className="relative inline-flex h-2 w-2 rounded-full"
				style={{
					background: `rgb(${rgb})`,
					boxShadow: `0 0 8px rgba(${rgb},0.9)`,
				}}
			/>
		</span>
	);
}
