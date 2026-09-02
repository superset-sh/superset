const STYLE = "voxel-bot";

const PARAMS = [
	"chestVariant=vents,screen,heart,dial,slot",
	"backgroundColor=ddd8cd",
	"bodyColor=a8a396,8c9b8f,9a8f80,8896a3,a0919b,b0a58c",
	"glowColor=c8b98f,9fb0a6,b09a9a",
].join("&");

export function avatarUrl(handle: string): string {
	return `https://api.dicebear.com/10.x/${STYLE}/svg?${PARAMS}&seed=${encodeURIComponent(handle)}`;
}
