import { Autumn } from "autumn-js";
import { env } from "../../env";

export const BOX_MINUTES_FEATURE_ID = "box_minutes";

export const autumn = env.AUTUMN_SECRET_KEY
	? new Autumn({ secretKey: env.AUTUMN_SECRET_KEY, failOpen: false })
	: null;
