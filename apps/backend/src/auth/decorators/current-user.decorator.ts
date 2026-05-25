import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import type { UserEntity } from "../../users/entities/user.entity";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserEntity => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: UserEntity }>();
    if (!req.user) {
      throw new Error("CurrentUser used on unauthenticated route");
    }
    return req.user;
  },
);
