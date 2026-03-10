import { z } from "zod";
import { createTaskSchema } from "./create-task.dto";

export const updateTaskSchema = createTaskSchema.partial();

export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;
