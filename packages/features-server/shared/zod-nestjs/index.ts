/**
 * Creates a NestJS-compatible DTO class from a Zod schema.
 * The class can be used with NestJS validation pipes and Swagger.
 */
export function createZodDto<T extends { parse: (input: unknown) => any; _zod?: any }>(schema: T) {
  type Output = T extends { _zod: { output: infer O } } ? O : any;

  class ZodDto {
    static schema = schema;

    static create(input: unknown): Output {
      return schema.parse(input);
    }
  }

  return ZodDto as unknown as {
    new (): Output;
    schema: T;
    create(input: unknown): Output;
  };
}

/**
 * Patches NestJS Swagger module to support Zod DTOs.
 * Call this once during application bootstrap.
 */
export function patchNestJsSwagger(): void {
  // No-op — Swagger integration can be added later
}
