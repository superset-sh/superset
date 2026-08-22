// Same path data as the reference's corner icon — not a library icon, so
// there's no risk of a different icon set's paths rendering subtly
// differently at 10px.
export function PlusMark() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M5 12h14" />
			<path d="M12 5v14" />
		</svg>
	);
}
