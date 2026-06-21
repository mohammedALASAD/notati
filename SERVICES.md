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
               React app (Vite)      Django / Python
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
| **GitHub** | Source code repository. Render connects to GitHub and auto-deploys on every push to `main`. |
| **Render** | Hosts both the frontend (React/Vite static site) and backend (Django API). Free tier sleeps after 15 min inactivity — mitigated by UptimeRobot. |

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
