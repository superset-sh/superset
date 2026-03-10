import { handle } from "hono/vercel";
import app from "../src/main";

export default handle(app);
