import { createZodDto } from "../../../../shared/zod-nestjs";
import { createCatalogFeatureSchema } from "./create-catalog-feature.dto";

export const updateCatalogFeatureSchema = createCatalogFeatureSchema.partial();

export class UpdateCatalogFeatureDto extends createZodDto(
  updateCatalogFeatureSchema,
) {}
