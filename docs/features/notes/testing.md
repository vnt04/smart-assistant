# Notes Testing Checklist

Use this checklist when changing Notes behavior. It covers backend API behavior, frontend UI behavior and edge cases that can regress easily.

## Backend API

### Notes CRUD

- Create a note with only `title`.
- Create a note with `contentHtml`, tags and `notebookId`.
- Reject empty or whitespace-only title.
- Reject invalid `notebookId`.
- Get note detail with tags and attachments arrays.
- Update title only.
- Update content and verify `contentText` changes.
- Update tags and verify tags are created/reused.
- Update `isPinned` and verify list ordering.
- Delete a note and verify it no longer appears in list/detail.

### Notes list and search

- List first page with default pagination.
- Respect `limit` and `page`.
- Search by title.
- Search by content text extracted from HTML.
- Search one-character query through LIKE fallback.
- Filter by tag.
- Filter by `pinned=true` and `pinned=false`.
- Filter by `notebookId`.
- Filter by `notebookId=none`.
- Filter by `includeChildren=true` for nested notebooks.

### Notebooks

- Create root notebook.
- Create child notebook.
- Rename notebook.
- Update notebook color.
- Move notebook to another parent.
- Reject setting parent to itself.
- Reject moves that create a cycle.
- Delete notebook and verify child notebooks/notes become uncategorized where expected.

### Tags

- List tags for current user only.
- Create tag.
- Delete tag.
- Ensure duplicate tag names per user do not create duplicate rows.
- Ensure same tag name can exist for different users.

### Attachments

- Upload allowed file type.
- Reject missing file.
- Reject oversized file according to `UPLOAD_MAX_MB`.
- Reject disallowed MIME type.
- Download attachment with authenticated owner.
- Reject download from another user.
- Delete attachment and verify metadata is removed.
- Handle metadata pointing to missing file with `attachment_missing_on_disk`.

## Frontend UI

### Explorer

- Load notebooks, tags and notes list on page open.
- Search input debounces before API call.
- Selecting a note opens editor.
- Mobile view switches from list to editor and back.
- Active tag filter changes notes list.
- Creating a note while tag filter is active adds that tag to new note.

### Editor

- Title edit marks note dirty.
- Content edit marks note dirty.
- Autosave persists changes after delay.
- Manual save from editor persists immediately.
- Empty title is saved as `Chưa có tiêu đề`.
- Pin/unpin updates list ordering.
- Changing notebook persists and updates visible list.
- Adding tag with Enter or comma works.
- Backspace removes last tag when tag input is empty.
- Removing a tag persists on save.

### Attachments UI

- Upload button sends selected file.
- New attachment appears after note detail refetch.
- Attachment link opens `/api/attachments/:id`.
- Delete attachment removes it from UI after refetch.
- Upload/delete errors are visible or at least do not break editor state.

## Security and ownership

- User A cannot list, get, update or delete User B's notes.
- User A cannot attach files to User B's note.
- User A cannot download or delete User B's attachment.
- User A cannot move a note into User B's notebook.
- User A cannot set a notebook parent to User B's notebook.

## Regression-prone cases

- Selected note is deleted from another action and selection clears.
- Selected note disappears because current search/tag filter changes.
- Notebook deletion invalidates both notebooks and notes queries.
- Tags query invalidates after note create/update with tags.
- Attachment upload uses multipart and must not set JSON `Content-Type`.
- Access token refresh path still works for attachment upload.
