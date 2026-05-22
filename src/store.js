/* ============================================================
   Notati Prototype — Store
   Wraps localStorage as a tiny "database" + session manager.
   Everything is prefixed with `notati:` to avoid collisions.
   // TODO: Replace with API calls + real auth when wiring backend.
   ============================================================ */

(function () {
  const NS = 'notati:v1';
  const K = {
    users:    NS + ':users',     // [{id, name, email, password, role, joinedAt}]
    sessions: NS + ':session',   // {userId, role}
    uploads:  NS + ':uploads',   // [{id, userId, title, description, fileName, fileType, sizeKB, status, uploadedAt, noteId|null}]
    notes:    NS + ':notes',     // [{id, uploadId, title, subject, tags[], description, fileName, sizeKB, publishedAt, publishedBy}]
    seeded:   NS + ':seeded'
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
      { id: up1, userId: u1, title: 'Organizational Behavior — Chapter 4 slides', description: 'Motivation theories lecture deck.',
        fileName: 'MGMT233_Ch4_Motivation.pptx', fileType: 'pptx', sizeKB: 4820,
        status: 'reviewed', uploadedAt: '2026-05-12T13:24:00Z', noteId: 'nt_1' },
      { id: up2, userId: u2, title: 'Data Structures lecture notes',              description: 'Trees and graphs unit, handwritten + scanned.',
        fileName: 'CS220_Trees_Graphs.pdf',     fileType: 'pdf',  sizeKB: 6210,
        status: 'reviewed', uploadedAt: '2026-05-15T10:02:00Z', noteId: 'nt_2' },
      { id: up3, userId: u1, title: 'Marketing Principles — case study',          description: 'Case write-up on Patagonia.',
        fileName: 'MKT201_Patagonia_Case.docx', fileType: 'docx', sizeKB: 312,
        status: 'pending',  uploadedAt: '2026-05-18T16:40:00Z', noteId: null },
      { id: up4, userId: u3, title: 'Discrete Math — week 9 textbook chapter',    description: 'Scanned pages 220–248.',
        fileName: 'MATH101_Wk9_Discrete.pdf',   fileType: 'pdf',  sizeKB: 8930,
        status: 'pending',  uploadedAt: '2026-05-20T09:15:00Z', noteId: null },
      { id: up5, userId: u2, title: 'Intro to IS — lecture deck',                  description: 'Information systems intro deck.',
        fileName: 'IS101_Lecture1.pptx',         fileType: 'pptx', sizeKB: 5120,
        status: 'pending',  uploadedAt: '2026-05-21T08:08:00Z', noteId: null }
    ];

    const notes = [
      { id: 'nt_1', uploadId: up1, title: 'Motivation, in plain English',
        subject: 'MGMT 233', tags: ['Management', 'Chapter 4', 'Motivation'],
        description: 'Internal vs. external motivation, broken down with everyday examples. Takes 8 minutes.',
        fileName: 'MGMT233_Ch4_Notes.pdf', sizeKB: 1240,
        publishedAt: '2026-05-13T11:00:00Z', publishedBy: adminId },
      { id: 'nt_2', uploadId: up2, title: 'Trees and graphs without the headache',
        subject: 'CS 220', tags: ['CS', 'Data Structures', 'Trees'],
        description: 'How to actually picture a binary tree and walk a graph without re-reading the textbook.',
        fileName: 'CS220_Trees_Notes.pdf', sizeKB: 1820,
        publishedAt: '2026-05-16T15:30:00Z', publishedBy: adminId },
      { id: 'nt_3', uploadId: null, title: 'Probability — the four rules that matter',
        subject: 'STAT 201', tags: ['Stats', 'Probability', 'Exam prep'],
        description: 'Conditional, joint, marginal, and Bayes — written like a friend explaining it the night before an exam.',
        fileName: 'STAT201_Probability_Notes.pdf', sizeKB: 980,
        publishedAt: '2026-05-08T09:20:00Z', publishedBy: adminId }
    ];

    write(K.users, users);
    write(K.uploads, uploads);
    write(K.notes, notes);
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
  function addUpload({ userId, title, description, file }) {
    // // TODO: Replace with POST /api/uploads (multipart). The file binary is NOT persisted in the prototype.
    if (!userId) throw new Error('Not signed in.');
    if (!title || !title.trim()) throw new Error('Give it a title before uploading.');
    if (!file) throw new Error('Pick a file first.');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const allowed = ['pdf', 'pptx', 'docx'];
    if (!allowed.includes(ext)) throw new Error('We only accept .pdf, .pptx, or .docx for now.');
    const up = {
      id: uid('up'),
      userId,
      title: title.trim(),
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
  function addNote({ uploadId, title, subject, tags, description, fileName, sizeKB, publishedBy }) {
    // // TODO: Replace with POST /api/notes (multipart PDF + JSON meta)
    if (!title || !title.trim()) throw new Error('Notes need a title.');
    if (!subject || !subject.trim()) throw new Error('Notes need a subject/topic.');
    if (!fileName) throw new Error('Attach a PDF to publish.');
    const n = {
      id: uid('nt'),
      uploadId: uploadId || null,
      title: title.trim(),
      subject: subject.trim(),
      tags: Array.isArray(tags) ? tags.map(t => t.trim()).filter(Boolean) : [],
      description: (description || '').trim(),
      fileName,
      sizeKB: sizeKB || 1000,
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
    // utility
    fakeDownload,
    // for dev: clear everything
    __reset() {
      Object.values(K).forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
      seed();
    }
  };
})();
