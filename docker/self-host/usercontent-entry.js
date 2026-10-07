import worker from "./index.js";
import { privateS3Bucket } from "./s3-bucket.js";

const bindings = new WeakMap();
export default {
	fetch(request, env, ctx) {
		let configured = bindings.get(env);
		if (!configured) {
			configured = { ...env, PRIVATE: privateS3Bucket(env) };
			bindings.set(env, configured);
		}
		return worker.fetch(request, configured, ctx);
	},
};
