import { RINGTONES } from "shared/ringtones";

const ringtoneUrlMap = new Map<string, string>(
	RINGTONES.map((ringtone) => [
		ringtone.filename,
		new URL(`../../resources/sounds/${ringtone.filename}`, import.meta.url)
			.toString(),
	]),
);

export function getRingtoneUrl(filename: string): string | null {
	return ringtoneUrlMap.get(filename) ?? null;
}
