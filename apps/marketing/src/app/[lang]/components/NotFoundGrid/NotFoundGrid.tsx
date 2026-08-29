export function NotFoundGrid() {
	return (
		<div className="absolute inset-0 pointer-events-none" aria-hidden="true">
			<svg
				className="absolute inset-0 w-full h-full"
				xmlns="http://www.w3.org/2000/svg"
			>
				<title>grid</title>
				<defs>
					<pattern
						id="notfound-grid"
						width="60"
						height="60"
						patternUnits="userSpaceOnUse"
					>
						<path
							d="M 60 0 L 0 0 0 60"
							fill="none"
							stroke="rgba(255,255,255,0.06)"
							strokeWidth="1"
						/>
					</pattern>
					<radialGradient id="notfound-grid-fade" cx="50%" cy="50%" r="50%">
						<stop offset="0%" stopColor="white" stopOpacity="1" />
						<stop offset="75%" stopColor="white" stopOpacity="0.95" />
						<stop offset="85%" stopColor="white" stopOpacity="0.7" />
						<stop offset="92%" stopColor="white" stopOpacity="0.3" />
						<stop offset="96%" stopColor="white" stopOpacity="0.1" />
						<stop offset="100%" stopColor="white" stopOpacity="0" />
					</radialGradient>
					<mask id="notfound-grid-mask">
						<rect width="100%" height="100%" fill="url(#notfound-grid-fade)" />
					</mask>
				</defs>
				<rect
					width="100%"
					height="100%"
					fill="url(#notfound-grid)"
					mask="url(#notfound-grid-mask)"
				/>
			</svg>
		</div>
	);
}
