import { z } from "zod";
import { createSessionProductSchema } from "./create-session-product.dto";

export const updateSessionProductSchema = createSessionProductSchema.partial();

export type UpdateSessionProductDto = z.infer<
  typeof updateSessionProductSchema
>;
