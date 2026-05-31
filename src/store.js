/* ============================================================
   Notati Prototype — Store
   Wraps localStorage as a tiny "database" + session manager.
   Everything is prefixed with `notati:` to avoid collisions.
   // TODO: Replace with API calls + real auth when wiring backend.
   ============================================================ */

(function () {
  const NS = 'notati:v6';
  const K = {
    users:     NS + ':users',     // [{id, name, email, password, role, joinedAt}]
    sessions:  NS + ':session',   // {userId, role}
    uploads:   NS + ':uploads',   // [{id, userId, college, courseName, chapterNumber, chapterTitle, title, description, fileName, fileType, sizeKB, status, uploadedAt, noteId|null}]
    notes:     NS + ':notes',     // [{id, uploadId, college, courseName, chapterNumber, chapterTitle, title, tags[], description, fileName, sizeKB, publishedAt, publishedBy}]
    purchases: NS + ':purchases', // [{userId, noteId, purchasedAt}]
    seeded:    NS + ':seeded'
  };

  // ---------- Low-level helpers ----------
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[notati] storage read failed', key, e);
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[notati] storage write failed', key, e);
    }
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  }
  function now() { return new Date().toISOString(); }

  // ---------- Seed: hardcoded admin + a few sample rows ----------
  // // TODO: Replace seed with real data fetched from backend
  function seed() {
    if (read(K.seeded, false)) return;

    const adminId = 'usr_admin';
    const u1 = uid('usr'), u2 = uid('usr'), u3 = uid('usr');

    const users = [
      { id: adminId, name: 'Admin', email: 'admin@notati.com', password: 'admin123', role: 'admin', joinedAt: '2026-01-04T10:00:00Z' },
      { id: u1, name: 'Mariam Al-Khalifa', email: 'mariam@uob.edu.bh',   password: 'demo1234', role: 'customer', joinedAt: '2026-02-12T09:21:00Z' },
      { id: u2, name: 'Omar Hassan',       email: 'omar@uob.edu.bh',     password: 'demo1234', role: 'customer', joinedAt: '2026-03-04T14:08:00Z' },
      { id: u3, name: 'Layla Ahmed',       email: 'layla@uob.edu.bh',    password: 'demo1234', role: 'customer', joinedAt: '2026-04-19T11:55:00Z' }
    ];

    const up1 = uid('up'), up2 = uid('up'), up3 = uid('up'), up4 = uid('up'), up5 = uid('up');
    const uploads = [
      { id: up1, userId: u1, college: 'College of Business Administration', courseName: 'MGMT 233', chapterNumber: '4', chapterTitle: 'Motivation Theories',
        title: 'MGMT 233 — Ch.4: Motivation Theories', description: 'Motivation theories lecture deck.',
        fileName: 'MGMT233_Ch4_Motivation.pptx', fileType: 'pptx', sizeKB: 4820,
        status: 'reviewed', uploadedAt: '2026-05-12T13:24:00Z', noteId: 'nt_1' },
      { id: up2, userId: u2, college: 'College of Information Technology', courseName: 'CS 220', chapterNumber: '6', chapterTitle: 'Trees and Graphs',
        title: 'CS 220 — Ch.6: Trees and Graphs', description: 'Trees and graphs unit, handwritten + scanned.',
        fileName: 'CS220_Trees_Graphs.pdf', fileType: 'pdf', sizeKB: 6210,
        status: 'reviewed', uploadedAt: '2026-05-15T10:02:00Z', noteId: 'nt_2' },
      { id: up3, userId: u1, college: 'College of Business Administration', courseName: 'MKT 201', chapterNumber: '3', chapterTitle: 'Patagonia Case Study',
        title: 'MKT 201 — Ch.3: Patagonia Case Study', description: 'Case write-up on Patagonia.',
        fileName: 'MKT201_Patagonia_Case.docx', fileType: 'docx', sizeKB: 312,
        status: 'pending', uploadedAt: '2026-05-18T16:40:00Z', noteId: null },
      { id: up4, userId: u3, college: 'College of Science', courseName: 'MATH 101', chapterNumber: '9', chapterTitle: 'Discrete Mathematics',
        title: 'MATH 101 — Ch.9: Discrete Mathematics', description: 'Scanned pages 220–248.',
        fileName: 'MATH101_Wk9_Discrete.pdf', fileType: 'pdf', sizeKB: 8930,
        status: 'pending', uploadedAt: '2026-05-20T09:15:00Z', noteId: null },
      { id: up5, userId: u2, college: 'College of Information Technology', courseName: 'IS 101', chapterNumber: '1', chapterTitle: 'Introduction to Information Systems',
        title: 'IS 101 — Ch.1: Introduction to Information Systems', description: 'Information systems intro deck.',
        fileName: 'IS101_Lecture1.pptx', fileType: 'pptx', sizeKB: 5120,
        status: 'pending', uploadedAt: '2026-05-21T08:08:00Z', noteId: null }
    ];

    const notes = [
      // ── MGMT 233 (4 chapters: 1 free, 3 paid) ──────────────────────
      { id: 'nt_5', uploadId: null,
        college: 'College of Business Administration', courseName: 'MGMT 233', chapterNumber: '1', chapterTitle: 'What is Management',
        title: 'Management 101 — the short version', tags: ['Management', 'Intro'],
        description: 'The four functions every manager does, in plain language. A solid starting point for the whole course.',
        fileName: 'MGMT233_Ch1_Notes.pdf', sizeKB: 650, price: 0,
        publishedAt: '2026-05-05T09:00:00Z', publishedBy: adminId },
      { id: 'nt_6', uploadId: null,
        college: 'College of Business Administration', courseName: 'MGMT 233', chapterNumber: '2', chapterTitle: 'Organisational Structure',
        title: 'Structure: why your company is shaped the way it is', tags: ['Management', 'Structure', 'Org design'],
        description: 'Flat vs. tall, centralised vs. decentralised — what these mean in practice and how exams test them.',
        fileName: 'MGMT233_Ch2_Notes.pdf', sizeKB: 810, price: 0.5,
        publishedAt: '2026-05-07T10:00:00Z', publishedBy: adminId },
      { id: 'nt_7', uploadId: null,
        college: 'College of Business Administration', courseName: 'MGMT 233', chapterNumber: '3', chapterTitle: 'Leadership Styles',
        title: 'Leadership styles, one page each', tags: ['Management', 'Leadership'],
        description: 'Autocratic, democratic, laissez-faire — and when each one actually works. Includes exam-style comparison table.',
        fileName: 'MGMT233_Ch3_Notes.pdf', sizeKB: 920, price: 1,
        publishedAt: '2026-05-09T11:00:00Z', publishedBy: adminId },
      { id: 'nt_1', uploadId: up1,
        college: 'College of Business Administration', courseName: 'MGMT 233', chapterNumber: '4', chapterTitle: 'Motivation Theories',
        title: 'Motivation, in plain English', tags: ['Management', 'Motivation'],
        description: 'Internal vs. external motivation, broken down with everyday examples. Takes 8 minutes.',
        fileName: 'MGMT233_Ch4_Notes.pdf', sizeKB: 1240, price: 1,
        publishedAt: '2026-05-13T11:00:00Z', publishedBy: adminId },

      // ── CS 220 (5 chapters: 1 free, 4 paid) ────────────────────────
      { id: 'nt_4', uploadId: null,
        college: 'College of Information Technology', courseName: 'CS 220', chapterNumber: '1', chapterTitle: 'Introduction to Data Structures',
        title: 'Data structures, from zero', tags: ['CS', 'Data Structures', 'Intro'],
        description: 'What data structures actually are and why they matter — before the textbook overwhelms you.',
        fileName: 'CS220_Ch1_Notes.pdf', sizeKB: 720, price: 0,
        publishedAt: '2026-05-06T08:00:00Z', publishedBy: adminId },
      { id: 'nt_8', uploadId: null,
        college: 'College of Information Technology', courseName: 'CS 220', chapterNumber: '2', chapterTitle: 'Arrays and Linked Lists',
        title: 'Arrays vs. linked lists — when to pick which', tags: ['CS', 'Arrays', 'Linked Lists'],
        description: 'Side-by-side comparison of time complexity and memory, with diagrams. Great for quick revision.',
        fileName: 'CS220_Ch2_Notes.pdf', sizeKB: 880, price: 0.5,
        publishedAt: '2026-05-08T09:00:00Z', publishedBy: adminId },
      { id: 'nt_9', uploadId: null,
        college: 'College of Information Technology', courseName: 'CS 220', chapterNumber: '3', chapterTitle: 'Stacks and Queues',
        title: 'Stacks and queues — LIFO and FIFO made obvious', tags: ['CS', 'Stacks', 'Queues'],
        description: 'Push, pop, enqueue, dequeue. Real-world analogies, implementation sketch, and common exam traps.',
        fileName: 'CS220_Ch3_Notes.pdf', sizeKB: 760, price: 0.5,
        publishedAt: '2026-05-10T10:00:00Z', publishedBy: adminId },
      { id: 'nt_10', uploadId: null,
        college: 'College of Information Technology', courseName: 'CS 220', chapterNumber: '4', chapterTitle: 'Sorting Algorithms',
        title: 'Sorting: bubble to quicksort in one sheet', tags: ['CS', 'Sorting', 'Algorithms'],
        description: 'Big-O for each algorithm, best/worst/average cases, and the one you should reach for by default.',
        fileName: 'CS220_Ch4_Notes.pdf', sizeKB: 1050, price: 1,
        publishedAt: '2026-05-12T11:00:00Z', publishedBy: adminId },
      { id: 'nt_2', uploadId: up2,
        college: 'College of Information Technology', courseName: 'CS 220', chapterNumber: '6', chapterTitle: 'Trees and Graphs',
        title: 'Trees and graphs without the headache', tags: ['CS', 'Trees', 'Graphs'],
        description: 'How to actually picture a binary tree and walk a graph without re-reading the textbook.',
        fileName: 'CS220_Trees_Notes.pdf', sizeKB: 1820, price: 0.5,
        publishedAt: '2026-05-16T15:30:00Z', publishedBy: adminId },

      // ── STAT 201 (4 chapters: 1 free, 3 paid) ──────────────────────
      { id: 'nt_11', uploadId: null,
        college: 'College of Science', courseName: 'STAT 201', chapterNumber: '1', chapterTitle: 'Introduction to Statistics',
        title: 'Statistics — what are we even doing here?', tags: ['Stats', 'Intro'],
        description: 'Population vs. sample, types of data, and why statistics is the most useful thing you will learn this semester.',
        fileName: 'STAT201_Ch1_Notes.pdf', sizeKB: 590, price: 0,
        publishedAt: '2026-05-04T08:00:00Z', publishedBy: adminId },
      { id: 'nt_12', uploadId: null,
        college: 'College of Science', courseName: 'STAT 201', chapterNumber: '2', chapterTitle: 'Descriptive Statistics',
        title: 'Mean, median, mode — and when each one lies', tags: ['Stats', 'Descriptive'],
        description: 'Why averages mislead, when to use the median, and how spread (variance, SD) tells the real story.',
        fileName: 'STAT201_Ch2_Notes.pdf', sizeKB: 720, price: 0.5,
        publishedAt: '2026-05-06T09:00:00Z', publishedBy: adminId },
      { id: 'nt_13', uploadId: null,
        college: 'College of Science', courseName: 'STAT 201', chapterNumber: '3', chapterTitle: 'Probability Distributions',
        title: 'Distributions: normal, binomial, Poisson', tags: ['Stats', 'Distributions'],
        description: 'Visual explanations of the three distributions you see most in exams, with worked examples.',
        fileName: 'STAT201_Ch3_Notes.pdf', sizeKB: 890, price: 1,
        publishedAt: '2026-05-10T10:00:00Z', publishedBy: adminId },
      { id: 'nt_3', uploadId: null,
        college: 'College of Science', courseName: 'STAT 201', chapterNumber: '5', chapterTitle: 'Probability Rules',
        title: 'Probability — the four rules that matter', tags: ['Stats', 'Probability', 'Exam prep'],
        description: 'Conditional, joint, marginal, and Bayes — written like a friend explaining it the night before an exam.',
        fileName: 'STAT201_Probability_Notes.pdf', sizeKB: 980, price: 1,
        publishedAt: '2026-05-08T09:20:00Z', publishedBy: adminId },

      // ── ACC 112 (3 chapters: 1 free, 2 paid) ───────────────────────
      { id: 'nt_14', uploadId: null,
        college: 'College of Business Administration', courseName: 'ACC 112', chapterNumber: '1', chapterTitle: 'Introduction to Accounting',
        title: 'Accounting from scratch — no background needed', tags: ['Accounting', 'Intro'],
        description: 'The accounting equation, why debits and credits exist, and how every transaction tells a story.',
        fileName: 'ACC112_Ch1_Notes.pdf', sizeKB: 670, price: 0,
        publishedAt: '2026-05-03T08:00:00Z', publishedBy: adminId },
      { id: 'nt_15', uploadId: null,
        college: 'College of Business Administration', courseName: 'ACC 112', chapterNumber: '2', chapterTitle: 'The Accounting Cycle',
        title: 'The accounting cycle, step by step', tags: ['Accounting', 'Journal', 'Ledger'],
        description: 'Journals → ledger → trial balance → financial statements. One clear flow with a worked example.',
        fileName: 'ACC112_Ch2_Notes.pdf', sizeKB: 820, price: 0.5,
        publishedAt: '2026-05-05T09:00:00Z', publishedBy: adminId },
      { id: 'nt_16', uploadId: null,
        college: 'College of Business Administration', courseName: 'ACC 112', chapterNumber: '3', chapterTitle: 'Financial Statements',
        title: 'Reading financial statements like a pro', tags: ['Accounting', 'Finance', 'Statements'],
        description: 'Income statement, balance sheet, cash flow — what each one tells you and how they connect.',
        fileName: 'ACC112_Ch3_Notes.pdf', sizeKB: 950, price: 1,
        publishedAt: '2026-05-07T10:00:00Z', publishedBy: adminId }
    ];

    // Demo purchases — mix of "For you" and locked notes across students
    const purchases = [
      { userId: u1, noteId: 'nt_2',  purchasedAt: '2026-05-17T10:00:00Z' }, // Mariam bought CS 220 Ch.6
      { userId: u1, noteId: 'nt_7',  purchasedAt: '2026-05-18T09:00:00Z' }, // Mariam bought MGMT 233 Ch.3
      { userId: u2, noteId: 'nt_3',  purchasedAt: '2026-05-18T11:00:00Z' }, // Omar bought STAT 201 Ch.5
      { userId: u2, noteId: 'nt_10', purchasedAt: '2026-05-19T14:00:00Z' }, // Omar bought CS 220 Ch.4
      { userId: u2, noteId: 'nt_15', purchasedAt: '2026-05-20T08:00:00Z' }, // Omar bought ACC 112 Ch.2
      { userId: u3, noteId: 'nt_1',  purchasedAt: '2026-05-20T09:30:00Z' }, // Layla bought MGMT 233 Ch.4
      { userId: u3, noteId: 'nt_3',  purchasedAt: '2026-05-21T08:00:00Z' }, // Layla bought STAT 201 Ch.5
      { userId: u3, noteId: 'nt_16', purchasedAt: '2026-05-22T11:00:00Z' }, // Layla bought ACC 112 Ch.3
    ];

    write(K.users, users);
    write(K.uploads, uploads);
    write(K.notes, notes);
    write(K.purchases, purchases);
    write(K.seeded, true);
  }

  // ---------- Users ----------
  function getUsers() { return read(K.users, []); }
  function getUserById(id) { return getUsers().find(u => u.id === id) || null; }
  function getUserByEmail(email) {
    const e = (email || '').toLowerCase().trim();
    return getUsers().find(u => u.email.toLowerCase() === e) || null;
  }
  function signUp({ name, email, password }) {
    // // TODO: Replace with POST /api/auth/signup
    if (!name || !email || !password) throw new Error('Please fill out every field.');
    if (password.length < 6) throw new Error('Password should be at least 6 characters.');
    if (getUserByEmail(email)) throw new Error('An account with that email already exists.');
    const user = {
      id: uid('usr'),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password, // plain text only because this is a prototype
      role: 'customer',
      joinedAt: now()
    };
    const users = getUsers(); users.push(user); write(K.users, users);
    return user;
  }
  function logIn({ email, password }) {
    // // TODO: Replace with POST /api/auth/login + JWT/session
    const user = getUserByEmail(email);
    if (!user || user.password !== password) throw new Error("Email or password doesn't match.");
    setSession(user);
    return user;
  }
  function getSession() {
    const s = read(K.sessions, null);
    if (!s) return null;
    const user = getUserById(s.userId);
    if (!user) { clearSession(); return null; }
    return user;
  }
  function setSession(user) { write(K.sessions, { userId: user.id, role: user.role }); }
  function clearSession() { try { localStorage.removeItem(K.sessions); } catch(e){} }

  // ---------- Uploads (customer content submissions) ----------
  function getUploads() { return read(K.uploads, []); }
  function getUploadById(id) { return getUploads().find(u => u.id === id) || null; }
  function getUploadsByUser(userId) { return getUploads().filter(u => u.userId === userId); }
  function addUpload({ userId, college, courseName, chapterNumber, chapterTitle, description, file }) {
    // // TODO: Replace with POST /api/uploads (multipart). The file binary is NOT persisted in the prototype.
    if (!userId) throw new Error('Not signed in.');
    if (!college || !college.trim()) throw new Error('Select or enter your college.');
    if (!courseName || !courseName.trim()) throw new Error('Enter the course name or code.');
    if (!chapterNumber || !String(chapterNumber).trim()) throw new Error('Enter the chapter number.');
    if (!chapterTitle || !chapterTitle.trim()) throw new Error('Enter the chapter title.');
    if (!file) throw new Error('Pick a file first.');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const allowed = ['pdf', 'pptx', 'docx'];
    if (!allowed.includes(ext)) throw new Error('We only accept .pdf, .pptx, or .docx for now.');
    const col  = college.trim();
    const cn   = courseName.trim();
    const cnum = String(chapterNumber).trim();
    const cttl = chapterTitle.trim();
    const up = {
      id: uid('up'),
      userId,
      college: col,
      courseName: cn,
      chapterNumber: cnum,
      chapterTitle: cttl,
      title: `${cn} — Ch.${cnum}: ${cttl}`,
      description: (description || '').trim(),
      fileName: file.name,
      fileType: ext,
      sizeKB: Math.max(1, Math.round((file.size || 1024) / 1024)),
      status: 'pending',
      uploadedAt: now(),
      noteId: null
    };
    const ups = getUploads(); ups.unshift(up); write(K.uploads, ups);
    return up;
  }
  function setUploadStatus(uploadId, status, noteId) {
    const ups = getUploads();
    const i = ups.findIndex(u => u.id === uploadId);
    if (i < 0) return null;
    ups[i] = { ...ups[i], status, ...(noteId !== undefined ? { noteId } : {}) };
    write(K.uploads, ups);
    return ups[i];
  }

  // ---------- Notes (admin-published study notes) ----------
  function getNotes() { return read(K.notes, []); }
  function getNoteById(id) { return getNotes().find(n => n.id === id) || null; }
  function addNote({ uploadId, title, college, courseName, chapterNumber, chapterTitle, tags, description, fileName, sizeKB, publishedBy, price }) {
    // // TODO: Replace with POST /api/notes (multipart PDF + JSON meta)
    if (!title || !title.trim()) throw new Error('Notes need a title.');
    if (!college || !college.trim()) throw new Error('Notes need a college.');
    if (!courseName || !courseName.trim()) throw new Error('Notes need a course name.');
    if (!chapterNumber || !String(chapterNumber).trim()) throw new Error('Notes need a chapter number.');
    if (!chapterTitle || !chapterTitle.trim()) throw new Error('Notes need a chapter title.');
    if (!fileName) throw new Error('Attach a PDF to publish.');
    const n = {
      id: uid('nt'),
      uploadId: uploadId || null,
      title: title.trim(),
      college: (college || '').trim(),
      courseName: (courseName || '').trim(),
      chapterNumber: String(chapterNumber || '').trim(),
      chapterTitle: (chapterTitle || '').trim(),
      tags: Array.isArray(tags) ? tags.map(t => t.trim()).filter(Boolean) : [],
      description: (description || '').trim(),
      fileName,
      sizeKB: sizeKB || 1000,
      price: price != null ? Number(price) : 0,
      publishedAt: now(),
      publishedBy: publishedBy
    };
    const all = getNotes(); all.unshift(n); write(K.notes, all);
    if (uploadId) setUploadStatus(uploadId, 'reviewed', n.id);
    return n;
  }
  function updateNote(id, patch) {
    const all = getNotes();
    const i = all.findIndex(n => n.id === id);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch };
    write(K.notes, all);
    return all[i];
  }
  function deleteNote(id) {
    const all = getNotes();
    const note = all.find(n => n.id === id);
    write(K.notes, all.filter(n => n.id !== id));
    if (note && note.uploadId) setUploadStatus(note.uploadId, 'pending', null);
    return true;
  }

  // ---------- Purchases ----------
  function getPurchases() { return read(K.purchases, []); }

  function getPurchasedNoteIds(userId) {
    const owned = new Set(
      getPurchases().filter(p => p.userId === userId).map(p => p.noteId)
    );
    // Notes created from the user's own uploads are always free
    getUploads().filter(u => u.userId === userId && u.noteId).forEach(u => owned.add(u.noteId));
    return owned;
  }

  function hasPurchased(userId, noteId) {
    return getPurchasedNoteIds(userId).has(noteId);
  }

  function canReadNote(userId, note) {
    if (!note) return false;
    const price = note.price != null ? Number(note.price) : 0;
    if (price === 0) return true;
    return hasPurchased(userId, note.id);
  }

  function purchaseNote(userId, noteId) {
    if (hasPurchased(userId, noteId)) return true;
    const purchases = getPurchases();
    purchases.push({ userId, noteId, purchasedAt: now() });
    write(K.purchases, purchases);
    return true;
  }

  function revokePurchase(userId, noteId) {
    write(K.purchases, getPurchases().filter(p => !(p.userId === userId && p.noteId === noteId)));
    return true;
  }

  // ---------- Simulated download ----------
  function fakeDownload(filename, body) {
    // // TODO: Replace with real signed-URL or blob streaming from API
    const text = body || `[Notati prototype] This is a placeholder for ${filename}.\nIn production, the real file binary will be served by the API.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Boot
  seed();

  window.NotatiStore = {
    // session
    getSession, signUp, logIn, clearSession, setSession,
    // users
    getUsers, getUserById, getUserByEmail,
    // uploads
    getUploads, getUploadById, getUploadsByUser, addUpload, setUploadStatus,
    // notes
    getNotes, getNoteById, addNote, updateNote, deleteNote,
    // purchases
    getPurchases, getPurchasedNoteIds, hasPurchased, purchaseNote, revokePurchase, canReadNote,
    // utility
    fakeDownload,
    // for dev: clear everything
    __reset() {
      Object.values(K).forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
      seed();
    }
  };
})();
