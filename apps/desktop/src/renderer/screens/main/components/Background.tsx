export function Background() {
	return (
		<>
			{/* SVG filter definition */}
			<svg
				style={{ position: "absolute", width: 0, height: 0 }}
				aria-hidden="true"
			>
				<filter id="noise">
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.8"
						numOctaves="4"
						stitchTiles="stitch"
					/>
					<feColorMatrix type="saturate" values="0" />
					<feBlend mode="multiply" />
				</filter>
			</svg>

			{/* Gradient background */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"linear-gradient(135deg, #8B9DC3 0%, #7B8AB8 25%, #8892BF 50%, #9B94C5 75%, #A899C9 100%)",
				}}
			/>

			{/* Noise overlay */}
			<div
				className="absolute inset-0 opacity-[0.08]"
				style={{
					filter: "url(#noise)",
				}}
			/>
		</>
	);
}
