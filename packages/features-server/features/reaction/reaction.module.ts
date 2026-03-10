/**
 * Reaction Feature - NestJS Module
 */

import { Module } from "@nestjs/common";
import { ReactionController } from "./controller/reaction.controller";
import { ReactionService } from "./service";

@Module({
  controllers: [ReactionController],
  providers: [ReactionService],
  exports: [ReactionService],
})
export class ReactionModule {}
