import worker, { PageHub as InstrumentedPageHub } from "./index.js";
import { privateS3Bucket } from "./s3-bucket.js";

export { OrgHub } from "./index.js";

export class PageHub extends InstrumentedPageHub {
	constructor(ctx, env) {
		super(ctx, { ...env, PRIVATE: privateS3Bucket(env) });
	}
}

export default worker;
