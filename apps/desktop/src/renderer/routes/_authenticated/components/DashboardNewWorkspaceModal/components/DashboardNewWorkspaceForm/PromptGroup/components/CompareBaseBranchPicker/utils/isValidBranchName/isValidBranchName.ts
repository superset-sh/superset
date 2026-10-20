// Mirrors `git check-ref-format --branch`.
const FORBIDDEN = /[\s~^:?*[\\]|\.\.|@\{|\/\/|^\/|\/$|\.$/;

function hasControlCharacter(name: string): boolean {
	return [...name].some((char) => {
		const code = char.charCodeAt(0);
		return code < 0x20 || code === 0x7f;
	});
}

export function isValidBranchName(name: string): boolean {
	if (
		name === "" ||
		name === "@" ||
		name.startsWith("-") ||
		FORBIDDEN.test(name) ||
		hasControlCharacter(name)
	) {
		return false;
	}
	return name
		.split("/")
		.every((part) => !part.startsWith(".") && !part.endsWith(".lock"));
}
