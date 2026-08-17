interface PlainIconProps {
	className?: string;
}

/** Plain (plain.com) logo mark; follows currentColor like the react-icons set. */
export function PlainIcon({ className }: PlainIconProps) {
	return (
		<svg
			viewBox="0 0 989 1000"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			role="img"
			aria-label="Plain"
		>
			<path
				fill="currentColor"
				d="M301.784 666.637C279.762 666.637 250.165 680.425 236.009 697.28L7.51425 969.357C-6.63941 986.212 -0.203706 1000 21.8183 1000H437.503C621.773 1000 771.154 850.749 771.154 666.637C771.154 659.753 770.879 652.934 770.466 646.154C734.514 659.392 695.657 666.637 655.104 666.637H301.784Z"
			/>
			<path
				fill="currentColor"
				d="M988.461 333.319C988.461 149.233 839.303 0 655.309 0H395.565C373.577 0 344.022 13.7897 329.888 30.6419L101.735 302.677C87.6007 319.529 94.0268 333.315 116.014 333.315H438.034C615.149 333.315 759.916 471.614 770.499 646.154C897.724 599.246 988.461 476.892 988.461 333.319Z"
			/>
		</svg>
	);
}
