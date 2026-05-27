# Notati

A student-to-student notes marketplace built for university students in Bahrain.

Students upload their lecture slides, textbook chapters, or handwritten notes. An admin reviews the submission and publishes a clean, polished version back to the library. Other students can then browse the library and purchase notes to unlock and read them.

## How it works

1. **Upload** — A student submits a file (.pdf, .pptx, or .docx) along with the college, course name, chapter number, and chapter title.
2. **Review** — An admin reviews the submission and publishes a formatted note with a library-friendly title, tags, and description.
3. **Purchase** — Other students browse the library. Only purchased notes are readable. Students always get free access to notes published from their own uploads.

## Features

- Student registration and login
- File upload with structured metadata (college, course, chapter)
- Admin content inbox — review, publish, edit, and delete notes
- Notes library with search and filter by course
- Purchase-gating — notes are locked until bought
- Simulated in-app PDF reader and download
- Admin dashboard with live stats

## Tech stack

- React 18 (loaded via CDN, no build step)
- Babel Standalone — JSX compiled in the browser at runtime
- localStorage as a prototype database (`NotatiStore`)
- Pure CSS with CSS custom properties
- Hosted on GitHub Pages

## Running locally

```bash
cd "Notati 1"
python3 -m http.server 3000
```

Then open [http://localhost:3000](http://localhost:3000).

## Demo accounts

| Role    | Email                  | Password  |
|---------|------------------------|-----------|
| Admin   | admin@notati.com       | admin123  |
| Student | mariam@uob.edu.bh      | demo1234  |
| Student | omar@uob.edu.bh        | demo1234  |
| Student | layla@uob.edu.bh       | demo1234  |

## Note

This is a prototype. All data is stored in `localStorage` and is local to the browser. A real backend (Supabase or similar) and a payment integration are planned for the production version.
