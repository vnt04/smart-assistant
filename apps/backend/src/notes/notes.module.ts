import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsModule } from "../settings/settings.module";
import { UsersModule } from "../users/users.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { AttachmentEntity } from "./entities/attachment.entity";
import { NoteEntity } from "./entities/note.entity";
import { NotebookEntity } from "./entities/notebook.entity";
import { ShareEntity } from "./entities/share.entity";
import { ShareInviteEntity } from "./entities/share-invite.entity";
import { TagEntity } from "./entities/tag.entity";
import { NotebooksController } from "./notebooks.controller";
import { NotebooksService } from "./notebooks.service";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";
import { PublicShareController } from "./public-share.controller";
import { SharesController } from "./shares.controller";
import { SharesService } from "./shares.service";
import { TagsController } from "./tags.controller";
import { TagsService } from "./tags.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotebookEntity,
      NoteEntity,
      TagEntity,
      AttachmentEntity,
      ShareEntity,
      ShareInviteEntity,
    ]),
    SettingsModule,
    UsersModule,
  ],
  controllers: [
    NotebooksController,
    TagsController,
    NotesController,
    AttachmentsController,
    SharesController,
    PublicShareController,
  ],
  providers: [
    NotebooksService,
    TagsService,
    NotesService,
    AttachmentsService,
    SharesService,
  ],
  exports: [NotesService, NotebooksService, TagsService, AttachmentsService],
})
export class NotesModule {}
