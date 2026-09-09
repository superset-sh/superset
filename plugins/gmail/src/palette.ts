export interface LabelColor {
	textColor: string;
	backgroundColor: string;
}

const ALLOWED = new Set([
	"#000000",
	"#434343",
	"#666666",
	"#999999",
	"#cccccc",
	"#efefef",
	"#f3f3f3",
	"#ffffff",
	"#fb4c2f",
	"#ffad47",
	"#fad165",
	"#16a766",
	"#43d692",
	"#4a86e8",
	"#a479e2",
	"#f691b3",
	"#f6c5be",
	"#ffe6c7",
	"#fef1d1",
	"#b9e4d0",
	"#c6f3de",
	"#c9daf8",
	"#e4d7f5",
	"#fcdee8",
	"#efa093",
	"#ffd6a2",
	"#fce8b3",
	"#89d3b2",
	"#a0eac9",
	"#a4c2f4",
	"#d0bcf1",
	"#fbc8d9",
	"#e66550",
	"#ffbc6b",
	"#fcda83",
	"#44b984",
	"#68dfa9",
	"#6d9eeb",
	"#b694e8",
	"#f7a7c0",
	"#cc3a21",
	"#eaa041",
	"#f2c960",
	"#149e60",
	"#3dc789",
	"#3c78d8",
	"#8e63ce",
	"#e07798",
	"#ac2b16",
	"#cf8933",
	"#d5ae49",
	"#0b804b",
	"#2a9c68",
	"#285bac",
	"#653e9b",
	"#b65775",
	"#822111",
	"#a46a21",
	"#aa8831",
	"#076239",
	"#1a764d",
	"#1c4587",
	"#41236d",
	"#83334c",
	"#464646",
	"#e7e7e7",
	"#0d3472",
	"#b6cff5",
	"#0d3b44",
	"#98d7e4",
	"#3d188e",
	"#e3d7ff",
	"#711a36",
	"#fbd3e0",
	"#8a1c0a",
	"#f2b2a8",
	"#7a2e0b",
	"#ffc8af",
	"#7a4706",
	"#ffdeb5",
	"#594c05",
	"#fbe983",
	"#684e07",
	"#fdedc1",
	"#0b4f30",
	"#b3efd3",
	"#04502e",
	"#a2dcc1",
	"#c2c2c2",
]);

export const PRESETS: Record<string, LabelColor> = {
	black: { backgroundColor: "#000000", textColor: "#ffffff" },
	gray: { backgroundColor: "#666666", textColor: "#ffffff" },
	white: { backgroundColor: "#ffffff", textColor: "#000000" },
	red: { backgroundColor: "#fb4c2f", textColor: "#ffffff" },
	orange: { backgroundColor: "#ffad47", textColor: "#ffffff" },
	yellow: { backgroundColor: "#fad165", textColor: "#000000" },
	green: { backgroundColor: "#16a766", textColor: "#ffffff" },
	teal: { backgroundColor: "#43d692", textColor: "#ffffff" },
	blue: { backgroundColor: "#4a86e8", textColor: "#ffffff" },
	purple: { backgroundColor: "#a479e2", textColor: "#ffffff" },
	pink: { backgroundColor: "#f691b3", textColor: "#ffffff" },
	brown: { backgroundColor: "#8a1c0a", textColor: "#ffffff" },
};

const DOCS =
	"https://developers.google.com/gmail/api/reference/rest/v1/users.labels";

function allowed(value: string, field: string): string {
	const normalized = value.trim().toLowerCase();
	if (!ALLOWED.has(normalized)) {
		throw new Error(
			`Invalid ${field} "${value}". Gmail only accepts colors from its fixed palette; see ${DOCS}.`,
		);
	}
	return normalized;
}

export function resolveColor(input: unknown): LabelColor | undefined {
	if (input === undefined || input === null || input === "") return undefined;

	if (typeof input === "string") {
		const key = input.trim().toLowerCase();
		const preset = Object.hasOwn(PRESETS, key) ? PRESETS[key] : undefined;
		if (!preset) {
			throw new Error(
				`Unknown color preset "${input}". Valid presets: ${Object.keys(PRESETS).join(", ")}. Or pass {textColor, backgroundColor}.`,
			);
		}
		return preset;
	}

	const pair = input as Partial<LabelColor>;
	if (
		typeof pair.textColor !== "string" ||
		typeof pair.backgroundColor !== "string"
	) {
		throw new Error("color needs both textColor and backgroundColor");
	}
	return {
		textColor: allowed(pair.textColor, "textColor"),
		backgroundColor: allowed(pair.backgroundColor, "backgroundColor"),
	};
}
