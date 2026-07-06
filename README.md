# Notati

A student-to-student notes marketplace for university students in Bahrain. Students upload lecture slides and documents; an admin reviews and publishes polished notes; other students browse, unlock, and read them.

**Live site:** https://notati-1.onrender.com

---

## How it works

1. **Upload** — A student submits a file (.pdf, .pptx, or .docx) with the college, course name, chapter number, and title.
2. **Review** — An admin reviews it in the content inbox and publishes a formatted note to the library.
3. **Unlock** — Students browse the library. Free chapters are readable immediately. Paid chapters are unlocked after payment via BenefitPay; the student sends a WhatsApp confirmation with their pre-filled order and the admin grants access manually.
4. **Read** — Unlocked notes appear in the student's personal "My Notes" folder view, ready to read or download.

---

## Features

### Student
- Register / log in (JWT-based auth)
- Dashboard with live stats (accessible notes, uploads, pending reviews)
- Notes library — browse by college, search by course, filter by price
- My Notes page — personal folder view of all unlocked chapters
- Upload content — submit files with structured metadata
- My Uploads — track submission status (pending / approved)
- Bag + checkout — add paid chapters to bag, checkout via BenefitPay + WhatsApp
- In-app PDF reader and download
- Submit testimonials for admin approval

### Admin
- Content inbox — review, publish, reject student uploads
- Notes manager — create, edit, delete published notes
- Users list — view all registered students
- Unlock access — grant or revoke note access per student
- Testimonials manager — approve or remove student reviews
- Leak tracing — every downloaded PDF is fingerprinted per student; trace a shared/leaked copy back to who downloaded it (see [LEAK_TRACING.md](LEAK_TRACING.md))

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 via CDN · Babel Standalone (in-browser JSX) · Pure CSS |
| Backend | Django 4 · Django REST Framework · SimpleJWT |
| Database | PostgreSQL (Neon, serverless) |
| File storage | Cloudinary |
| Hosting | Render (backend web service + static site) |

---

## Running locally

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in your secrets
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd "Notati 1"
python3 -m http.server 3000
```

Open http://localhost:3000. The frontend reads `src/api.js` for the backend URL — set `BASE_URL` to `http://localhost:8000/api` for local development.

---

## Environment variables (backend)

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret key |
| `DEBUG` | `True` for local, `False` in production |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts |
| `DATABASE_URL` | PostgreSQL connection string |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed frontend origins |

---

## Project structure

```
Notati 1/
├── src/
│   ├── app.jsx          # App root, routing, shell
│   ├── auth.jsx         # Login + signup views
│   ├── admin.jsx        # All admin pages
│   ├── customer.jsx     # All student pages + landing page
│   ├── components.jsx   # Shared UI components and icons
│   ├── api.js           # NotatiAPI — all fetch calls
│   ├── store.js         # NotatiStore — session + bag (localStorage)
│   └── app.css          # Global styles and design tokens
├── backend/
│   ├── api/             # Django app (models, views, serializers, urls)
│   └── notati/          # Django project settings
└── ds/                  # Static assets (fonts, icons, images)
```

---

## Deployment

The backend and frontend are hosted on Render's free tier; the database is on Neon's free tier.

- **Backend** — Django web service on Render. Auto-runs `python manage.py migrate` on each deploy. Sleeps after 15 min of inactivity (free tier); the frontend warms it up silently on page load.
- **Frontend** — Static site on Render. Must be deployed manually via Render dashboard → Manual Deploy → Deploy latest commit (Render does not auto-deploy static sites on push). Bump the `?v=` query strings in `index.html` on each frontend change so browsers fetch fresh files instead of cached ones.
- **Database** — PostgreSQL on Neon (serverless; auto-suspends when idle). Free tier: 100 CU-hrs compute + 0.5 GB storage per month. Keep the `/api/health/` endpoint DB-free so UptimeRobot pings don't wake Neon.
