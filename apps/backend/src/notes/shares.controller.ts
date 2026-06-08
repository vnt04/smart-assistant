import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  addShareInviteInputSchema,
  shareResourceTypeSchema,
  updateShareLinkInputSchema,
  type AddShareInviteInput,
  type Share,
  type ShareResourceType,
  type UpdateShareLinkInput,
} from "@assistant/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { UserEntity } from "../users/entities/user.entity";
import { SharesService } from "./shares.service";

@Controller("shares")
@UseGuards(JwtAuthGuard)
export class SharesController {
  constructor(private readonly svc: SharesService) {}

  @Get(":resourceType/:resourceId")
  get(
    @CurrentUser() user: UserEntity,
    @Param("resourceType", new ZodValidationPipe(shareResourceTypeSchema))
    resourceType: ShareResourceType,
    @Param("resourceId", new ParseUUIDPipe()) resourceId: string,
  ): Promise<Share> {
    return this.svc.getOrCreate(user.id, resourceType, resourceId);
  }

  @Put(":resourceType/:resourceId/link")
  @HttpCode(HttpStatus.OK)
  setLink(
    @CurrentUser() user: UserEntity,
    @Param("resourceType", new ZodValidationPipe(shareResourceTypeSchema))
    resourceType: ShareResourceType,
    @Param("resourceId", new ParseUUIDPipe()) resourceId: string,
    @Body(new ZodValidationPipe(updateShareLinkInputSchema))
    input: UpdateShareLinkInput,
  ): Promise<Share> {
    return this.svc.setLink(user.id, resourceType, resourceId, input.linkAccess);
  }

  @Post(":resourceType/:resourceId/invites")
  @HttpCode(HttpStatus.CREATED)
  addInvite(
    @CurrentUser() user: UserEntity,
    @Param("resourceType", new ZodValidationPipe(shareResourceTypeSchema))
    resourceType: ShareResourceType,
    @Param("resourceId", new ParseUUIDPipe()) resourceId: string,
    @Body(new ZodValidationPipe(addShareInviteInputSchema))
    input: AddShareInviteInput,
  ): Promise<Share> {
    return this.svc.addInvite(user.id, resourceType, resourceId, input.email);
  }

  @Delete(":resourceType/:resourceId/invites/:inviteId")
  @HttpCode(HttpStatus.OK)
  removeInvite(
    @CurrentUser() user: UserEntity,
    @Param("resourceType", new ZodValidationPipe(shareResourceTypeSchema))
    resourceType: ShareResourceType,
    @Param("resourceId", new ParseUUIDPipe()) resourceId: string,
    @Param("inviteId", new ParseUUIDPipe()) inviteId: string,
  ): Promise<Share> {
    return this.svc.removeInvite(user.id, resourceType, resourceId, inviteId);
  }

  @Delete(":resourceType/:resourceId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async stop(
    @CurrentUser() user: UserEntity,
    @Param("resourceType", new ZodValidationPipe(shareResourceTypeSchema))
    resourceType: ShareResourceType,
    @Param("resourceId", new ParseUUIDPipe()) resourceId: string,
  ): Promise<void> {
    await this.svc.stop(user.id, resourceType, resourceId);
  }
}
