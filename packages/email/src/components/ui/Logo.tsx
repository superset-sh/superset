import { Img } from "@react-email/components";

export function Logo() {
	return (
		<Img
			src="https://superset.sh/logo.png"
			alt="Superset Logo"
			width="100"
			height="auto"
			style={logoStyle}
		/>
	);
}

const logoStyle = {
	display: "block",
	maxWidth: "130px",
};
