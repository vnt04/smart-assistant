# Notes API

All endpoints require authentication unless noted otherwise. Send access token as:

```http
Authorization: Bearer <accessToken>
```

Base path in local development is usually `/api` through the frontend proxy or backend prefix.

## DTOs

### Note summary

```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "notebookId": "11111111-1111-1111-1111-111111111111",
  "title": "Ý tưởng sản phẩm",
  "excerpt": "Tóm tắt nội dung...",
  "isPinned": false,
  "createdAt": "2026-05-27T09:00:00.000Z",
  "updatedAt": "2026-05-27T09:10:00.000Z",
  "tags": [
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "name": "idea",
      "createdAt": "2026-05-27T09:00:00.000Z"
    }
  ]
}
```

### Note detail

```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "notebookId": null,
  "title": "Ý tưởng sản phẩm",
  "contentHtml": "<p>Nội dung</p>",
  "contentText": "Nội dung",
  "isPinned": true,
  "createdAt": "2026-05-27T09:00:00.000Z",
  "updatedAt": "2026-05-27T09:10:00.000Z",
  "tags": [],
  "attachments": []
}
```

### Notebook

```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "parentId": null,
  "name": "Công việc",
  "color": "#3b82f6",
  "createdAt": "2026-05-27T09:00:00.000Z",
  "updatedAt": "2026-05-27T09:10:00.000Z"
}
```

### Attachment

```json
{
  "id": "33333333-3333-3333-3333-333333333333",
  "noteId": "00000000-0000-0000-0000-000000000000",
  "originalName": "brief.pdf",
  "mime": "application/pdf",
  "sizeBytes": 102400,
  "createdAt": "2026-05-27T09:00:00.000Z"
}
```

## Notes

### List notes

```http
GET /api/notes?q=idea&tag=work&page=1&limit=20
```

Query parameters:

| Name | Type | Required | Description |
|---|---:|---:|---|
| `q` | string | no | Search title/content, 1-200 chars |
| `notebookId` | UUID or `none` | no | Filter by notebook or uncategorized notes |
| `includeChildren` | boolean | no | Include descendant notebooks when `notebookId` is a UUID |
| `tag` | string | no | Filter by tag name |
| `pinned` | boolean | no | Filter pinned/unpinned notes |
| `page` | number | no | Default `1` |
| `limit` | number | no | Default `20`, max `500` |

Response:

```json
{
  "items": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 1
  }
}
```

### Get note detail

```http
GET /api/notes/:id
```

Response: `Note detail`.

Errors:

- `404 note_not_found`

### Create note

```http
POST /api/notes
Content-Type: application/json
```

Request:

```json
{
  "notebookId": null,
  "title": "Ghi chú mới",
  "contentHtml": "<p>Nội dung</p>",
  "tags": ["idea", "work"],
  "isPinned": false
}
```

Validation:

- `title`: required after trim, max 255 chars.
- `contentHtml`: optional, default `""`, max 2,000,000 chars.
- `tags`: optional, max 20 items.
- `notebookId`: optional UUID or `null`.

Response: `201 Created` with `Note detail`.

### Update note

```http
PATCH /api/notes/:id
Content-Type: application/json
```

Request fields are optional:

```json
{
  "notebookId": null,
  "title": "Tên mới",
  "contentHtml": "<p>Nội dung mới</p>",
  "tags": ["updated"],
  "isPinned": true
}
```

Response: `Note detail`.

Errors:

- `404 note_not_found`
- `404 notebook_not_found` when moving to a notebook outside the current user or missing notebook.

### Delete note

```http
DELETE /api/notes/:id
```

Response: `204 No Content`.

Errors:

- `404 note_not_found`

## Notebooks

### List notebooks

```http
GET /api/notebooks
```

Response: `Notebook[]`, sorted by name ascending.

### Create notebook

```http
POST /api/notebooks
Content-Type: application/json
```

Request:

```json
{
  "parentId": null,
  "name": "Công việc",
  "color": "#3b82f6"
}
```

Response: `201 Created` with `Notebook`.

### Update notebook

```http
PATCH /api/notebooks/:id
Content-Type: application/json
```

Request fields are optional:

```json
{
  "parentId": null,
  "name": "Công việc cá nhân",
  "color": "#22c55e"
}
```

Errors:

- `400 invalid_parent`
- `400 cycle_detected`
- `404 notebook_not_found`

### Delete notebook

```http
DELETE /api/notebooks/:id
```

Response: `204 No Content`.

Notes in the deleted notebook become uncategorized through `ON DELETE SET NULL`.

## Tags

### List tags

```http
GET /api/tags
```

Response: `Tag[]`.

### Create tag

```http
POST /api/tags
Content-Type: application/json
```

Request:

```json
{
  "name": "idea"
}
```

Response: `201 Created` with `Tag`.

### Delete tag

```http
DELETE /api/tags/:id
```

Response: `204 No Content`.

## Attachments

### List attachments for note

```http
GET /api/notes/:noteId/attachments
```

Response: `Attachment[]`.

Errors:

- `404 note_not_found`

### Upload attachment

```http
POST /api/notes/:noteId/attachments
Content-Type: multipart/form-data
```

Form fields:

| Field | Type | Required |
|---|---|---:|
| `file` | binary | yes |

Allowed MIME types currently include common images, PDF, Word, Excel, ZIP, plain text and Markdown.

Response: `201 Created` with `Attachment`.

Errors:

- `400 no_file`
- `400 file_too_large`
- `400 mime_not_allowed`
- `404 note_not_found`

### Download attachment

```http
GET /api/attachments/:id
```

Response: file stream with original filename in `Content-Disposition`.

Errors:

- `404 attachment_not_found`
- `404 attachment_missing_on_disk`

### Delete attachment

```http
DELETE /api/attachments/:id
```

Response: `204 No Content`.

Errors:

- `404 attachment_not_found`
