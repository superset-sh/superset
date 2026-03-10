import { Injectable } from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle/types";
import { {{camelEntity}}s } from "@superbuilder/drizzle";
import type { {{PascalEntity}}, New{{PascalEntity}} } from "@superbuilder/drizzle";
import { eq } from "drizzle-orm";

@Injectable()
export class {{PascalName}}Service {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async findAll({ page, limit }: { page: number; limit: number }): Promise<{{PascalEntity}}[]> {
    return this.db.query.{{camelEntity}}s.findMany({
      limit,
      offset: (page - 1) * limit,
    });
  }

  async findById(id: string): Promise<{{PascalEntity}} | undefined> {
    return this.db.query.{{camelEntity}}s.findFirst({
      where: eq({{camelEntity}}s.id, id),
    });
  }

  async create(data: New{{PascalEntity}}): Promise<{{PascalEntity}}> {
    const [result] = await this.db.insert({{camelEntity}}s).values(data).returning();
    return result;
  }

  async update(id: string, data: Partial<New{{PascalEntity}}>): Promise<{{PascalEntity}}> {
    const [result] = await this.db
      .update({{camelEntity}}s)
      .set(data)
      .where(eq({{camelEntity}}s.id, id))
      .returning();
    return result;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete({{camelEntity}}s).where(eq({{camelEntity}}s.id, id));
  }
}
