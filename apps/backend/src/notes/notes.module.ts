import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsModule } from "../settings/settings.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { AttachmentEntity } from "./entities/attachment.entity";
import { NoteEntity } from "./entities/note.entity";
import { NotebookEntity } from "./entities/notebook.entity";
import { TagEntity } from "./entities/tag.entity";
import { NotebooksController } from "./notebooks.controller";
import { NotebooksService } from "./notebooks.service";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";
import { TagsController } from "./tags.controller";
import { TagsService } from "./tags.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotebookEntity,
      NoteEntity,
      TagEntity,
      AttachmentEntity,
    ]),
    SettingsModule,
  ],
  controllers: [
    NotebooksController,
    TagsController,
    NotesController,
    AttachmentsController,
  ],
  providers: [NotebooksService, TagsService, NotesService, AttachmentsService],
  exports: [NotesService, NotebooksService, TagsService, AttachmentsService],
})
export class NotesModule {}
