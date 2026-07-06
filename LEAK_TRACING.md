# Notati — Leak Tracing (per-download PDF fingerprint)

Every paid note delivered to a student is stamped, on the fly, with a code unique
to that **student + chapter**. If a note is shared or leaked, the code in the file
tells you exactly who downloaded it.

The stored master file (on Cloudinary) is never modified — only the copy each
student receives is stamped, so every copy is independently traceable.

---

## How the code is generated

`backend/api/tracing.py`:

```
code = HMAC-SHA256( SECRET_KEY , "<user_id>:<note_id>" )  →  base32  →  first 8 chars
```

- **Deterministic, not random** — the same student downloading the same chapter
  always gets the same code. Different student or different chapter → different code.
- It is per **note/chapter**, not per file — a multi-file note stamps every file
  with the same code.

## Where the code is stored

1. **Recomputable** from `SECRET_KEY` at any time (nothing to store).
2. **`DownloadLog` table** (Postgres/Neon) — one row per download/read:
   `user, note, code, ip, created_at`. This is the durable ground truth.
3. **Inside each delivered PDF**, in two layers:
   - **Metadata** — a custom `/NotatiTrace` key and `/Keywords: notati-trace:<code>`.
   - **On-page** — the string `NT-<code>` tiled faintly across every page
     (low-alpha text, so it survives printing/re-saving and works on any
     background).

Stamping is done by `pdfutils.fingerprint_pdf()` and is best-effort — it never
blocks a download if something goes wrong.

## Where stamping happens

`views._note_file_response()` (used by the note download endpoints). It stamps
only for authenticated **students**; admins get the clean master, and
samples/previews and non-PDF files are left untouched.

> In-app **reading** uses the same download endpoint, so it also stamps and logs.
> The "downloads" count therefore means "times accessed," not strictly downloads.

To keep every copy traceable, students are **not** given the raw Cloudinary URL for
paid notes — those always go through the fingerprinting proxy. Free notes and
admins keep the direct URL.

---

## How to trace a leaked file

### 1. Read the code off the file

- **macOS Preview:** Tools → Show Inspector (⌘I) → ⓘ tab → **Keywords** shows
  `notati-trace:<code>`.
- **Terminal (reads both layers, drag-and-drop the file):**
  ```
  cd backend && source .venv/bin/activate
  python manage.py extractcode <path-to.pdf>
  ```

### 2. Look up the student

- **Admin UI (recommended):** Admin → **Insights → Leak trace** → paste the code
  (`5KDV6FB3` or `NT-5KDV6FB3`, either works). Shows student, chapter, download
  count, and last-seen date.
- **API:** `GET /api/admin/trace/?code=<code>` (admin only).
- **CLI (on production):** `python manage.py wholeaked <code>`.
- **Django admin:** `/django-admin/` → **Download logs** (read-only; needs a Django
  superuser).
- **Neon SQL:**
  ```sql
  SELECT d.created_at, d.code, u.email, u.name,
         c.name AS course, n.chapter_number, n.chapter_title, d.ip
  FROM api_downloadlog d
  LEFT JOIN api_user   u ON u.id = d.user_id
  LEFT JOIN api_note   n ON n.id = d.note_id
  LEFT JOIN api_course c ON c.id = n.course_id
  ORDER BY d.created_at DESC
  LIMIT 200;
  ```

> **Lookups must run against production.** Running `wholeaked`/`extractcode`
> locally will not resolve a real code: the local database has no download rows,
> and the local `SECRET_KEY` differs from production, so the code can't be
> recomputed. Extract the code locally if you like, but do the lookup via the
> admin UI (or on the production server).

---

## Limitations (be honest about these)

- **Invisible ≠ unremovable.** A determined person with real tools (`exiftool`,
  `qpdf`, or re-printing/scanning) can strip both the metadata and the on-page
  text. macOS Preview only edits the standard `/Keywords` field, not the custom
  `/NotatiTrace`, so casual edits don't defeat it — lookup tools read
  `/NotatiTrace` first — but dedicated tampering can.
- The **`DownloadLog` is the real ground truth**; the customer can't touch the
  server. Even a fully-stripped file leaves a record of who downloaded that chapter.
- **Keep `SECRET_KEY` stable.** Rotating it changes future codes (old logged codes
  still resolve, since the code is stored in `DownloadLog`).
- The stamping CPU cost is on the **Render** web service (pypdf/reportlab per
  access), not on Neon — Neon only does a tiny insert per download.

## Where the code lives

- `backend/api/tracing.py` — code generation + reverse lookup
- `backend/api/pdfutils.py` — `fingerprint_pdf()`
- `backend/api/views.py` — `_note_file_response()` + `admin_trace` endpoint
- `backend/api/models.py` — `DownloadLog` (migration `0011_downloadlog`)
- `backend/api/management/commands/` — `wholeaked`, `extractcode`
- `src/admin.jsx` — the "Leak trace" tab in Insights
- Tests: `LeakTracingTests` in `backend/api/tests.py`
