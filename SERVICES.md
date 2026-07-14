# Notati — Services & Architecture

## How Everything Connects

```
                        [ User's Browser ]
                               |
                    visits notati.app (HTTPS)
                               |
                        [ Cloudflare ]
                    DNS + CDN + SSL for both
                    notati.app & api.notati.app
                          /         \
                         /           \
              [ Render Frontend ]   [ Render Backend ]
              React (no build step)  Django / Python
                                          |
                          ┌───────────────┼───────────────┐
                          |               |               |
                       [ Neon ]     [ Cloudinary ]   [ Resend ]
                     PostgreSQL      PDF / file       Email
                     database        storage          sending
```

---

## Services

### Code & Deployment
| Service | Role |
|---------|------|
| **GitHub** | Source code repository. Render deploys from `main`. |
| **Render** | Hosts both the frontend (static site) and backend (Django API). **Backend auto-deploys** on every push to `main` (and runs migrations in the release phase). **The frontend does NOT** — static sites must be deployed manually from the Render dashboard (Manual Deploy → Deploy latest commit). The frontend has **no build step**: React + JSX are compiled in the browser by Babel Standalone, so bump the `?v=` query strings in `index.html` on every frontend change or browsers serve stale cached files. Free tier sleeps after 15 min inactivity — mitigated by UptimeRobot. |

### Domain & Networking
| Service | Role |
|---------|------|
| **Cloudflare Registrar** | Where `notati.app` was purchased and renewed. |
| **Cloudflare** | Manages DNS records for `notati.app` and `api.notati.app`. Provides SSL certificates and acts as a CDN/proxy in front of Render. |

### Data & Storage
| Service | Role |
|---------|------|
| **Neon** | PostgreSQL database (free tier). Stores users, courses, notes metadata, access records, and uploads table. Scales to zero when idle, wakes in ~1–3 sec. |
| **Cloudinary** | Cloud storage for uploaded PDF files. The backend uploads files here and stores the URL in Neon. |

### Communication
| Service | Role |
|---------|------|
| **Resend** | Sends branded HTML emails from `support@notati.app` to students. The domain `notati.app` is verified in Resend via Cloudflare DNS. |

### Monitoring
| Service | Role |
|---------|------|
| **UptimeRobot** | Pings `https://api.notati.app/api/health/` every 5 minutes to keep Render awake. Uses a lightweight endpoint that returns `{"status":"ok"}` with no database query — so Neon can still sleep and conserve its free-tier CU-hrs. Free plan, no time limit, 50 monitors available. |

### SEO & Search
| Service | Role |
|---------|------|
| **Google Search Console** | Free Google tool that reports how Google sees `notati.app`. Used to **request re-indexing** after changing page metadata, **submit `sitemap.xml`**, and — under **Performance** — see which search queries actually bring students to the site (impressions, clicks, ranking position). It only *reports and requests*: it cannot edit the site, and it cannot force Google to update. Property verified via the HTML-file method. |

**How the site appears in Google / shared links.** These files are served from the web root, and the tags live in the `<head>` of `index.html`:

| File / tag | Purpose |
|------------|---------|
| `<title>` + `<meta name="description">` | The headline and snippet in Google results. Without a description, Google scrapes arbitrary page text and the snippet looks broken. |
| `favicon.ico`, `favicon.svg`, `favicon-96/192/512.png`, `apple-touch-icon.png` | The logo in the browser tab and next to the Google result. Google needs a **square, crawlable** icon; without one it shows a generic globe. |
| `og-image.png` (1200×630) + Open Graph / Twitter tags | The branded preview card shown when `notati.app` is pasted into **WhatsApp, Instagram, or LinkedIn**. |
| `robots.txt` | Allows crawling and points Google to the sitemap. The favicon must be crawlable, so nothing here may block it. |
| `sitemap.xml` | Submitted in Search Console to prompt a re-crawl. |
| `googleba8bc66c111c4cdf.html` | Search Console ownership proof. **Never delete this file** — removing it un-verifies the property. It is public by design and is not a secret. |

> **Google lags behind the site.** After a metadata change and a frontend deploy, the browser tab and link previews update immediately, but the Google result does not: the title/description typically refresh within a few days (faster after "Request indexing"), and the **favicon can take 1–3 weeks** because Google runs a separate favicon crawler. This is expected, not a bug. Re-requesting indexing does not speed it up.

---





---

## RDB Tables (Neon / PostgreSQL)

### Schema Diagram

```
┌─────────────┐
│  api_course │
└──────┬──────┘
       │ id
       │
┌──────▼──────┐         ┌──────────────┐
│   api_note  │◄────────│ api_notefile │
│             │  note_id └──────────────┘
│             │
│             │         ┌──────────────┐
│             │◄────────│  api_upload  │◄────────┐
└──────┬──────┘  note_id└──────┬───────┘         │
       │                       │            ┌─────┴──────────┐
       │                       │            │ api_uploadfile │
       │                       │            └────────────────┘
       │               ┌───────▼──────┐
       │               │   api_user   │
       └──────────────►│              │
    created_by_id      └───────┬──────┘
                               │ user_id
                    ┌──────────┴──────────┐
                    │                     │
             ┌──────▼──────┐    ┌─────────▼──────┐
             │  api_access │    │ api_testimonial │
             │  (user_id,  │    └────────────────┘
             │   note_id,  │
             │granted_by_id│
             └─────────────┘
```

### Table Reference

| Table | Purpose |
|-------|---------|
| `api_course` | Courses (e.g. ITIS103, LAW277). Each note belongs to one course. |
| `api_note` | Chapters — belong to a course, created by a user. Holds price and `is_free` flag. |
| `api_notefile` | PDF files attached to a note. One note can have multiple files. |
| `api_access` | Controls which student can read which paid chapter. Tracks who granted the access. |
| `api_upload` | Student-submitted uploads — linked to a note and a user. |
| `api_uploadfile` | Individual files inside a student upload. |
| `api_testimonial` | Reviews/testimonials left by users (admin-approved before showing). |
| `api_user` | All users (students + admin). Central table referenced by almost everything. |

### Key Foreign Keys

| From | Column | To |
|------|--------|----|
| `api_note` | `course_id` | `api_course.id` |
| `api_note` | `created_by_id` | `api_user.id` |
| `api_notefile` | `note_id` | `api_note.id` |
| `api_access` | `user_id` | `api_user.id` |
| `api_access` | `note_id` | `api_note.id` |
| `api_access` | `granted_by_id` | `api_user.id` |
| `api_upload` | `user_id` | `api_user.id` |
| `api_upload` | `note_id` | `api_note.id` |
| `api_uploadfile` | `upload_id` | `api_upload.id` |
| `api_testimonial` | `user_id` | `api_user.id` |

---

## Request Flow (example: student views a note)

1. Student opens `notati.app` in browser
2. **Cloudflare** resolves DNS → serves the React app from **Render Frontend**
3. React app calls `api.notati.app/api/notes/` → **Cloudflare** routes to **Render Backend**
4. Django queries **Neon** for the note metadata and file URL
5. File URL points to **Cloudinary** — browser opens the PDF directly from there

## Request Flow (example: admin sends an email)

1. Admin clicks Send in the admin panel
2. React app calls `api.notati.app/api/send-email/`
3. Django backend calls **Resend** API in a background thread
4. **Resend** delivers the branded HTML email from `support@notati.app` to the student
