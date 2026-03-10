/**
 * Comment Feature - NestJS Module
 */

import { Module } from "@nestjs/common";
import { CommentService } from "./service";
import { CommentController } from "./controller";

@Module({
  controllers: [CommentController],
  providers: [CommentService],
  exports: [CommentService],
})
export class CommentModule {}
