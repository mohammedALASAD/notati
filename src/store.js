/* ============================================================
   Notati — Store
   Auth, notes, uploads, and access now live in the Django API.
   This file only handles:
     - Session (reads the user object stored by NotatiAPI.login)
     - Bag (localStorage only, cleared after checkout)
     - canReadNote (uses note.hasAccess from API)
     - fakeDownload (placeholder until real PDF serving)
   ============================================================ */

(function () {
  const NS  = 'notati:v6';
  const BAG = NS + ':bag';

  function read(key, fallback) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
    catch(e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch(e) { console.warn('[notati] storage write failed', key, e); }
  }

  /* ── Session (delegated to NotatiAPI) ─────────────────────── */
  function getSession()       { return NotatiAPI.getStoredUser(); }
  function clearSession()     { NotatiAPI.logout(); }

  /* ── Access check ─────────────────────────────────────────── */
  function canReadNote(userId, note) {
    if (!note) return false;
    // API sets hasAccess=true for free notes and admin-granted paid notes
    if (note.hasAccess !== undefined) return !!note.hasAccess;
    // Fallback for any legacy note object without hasAccess
    return Number(note.price || 0) === 0;
  }

  /* ── Bag ──────────────────────────────────────────────────── */
  function getBag()     { return read(BAG, []); }
  function clearBag()   { write(BAG, []); return []; }
  function getBagTotal(){ return getBag().reduce((s, i) => s + Number(i.price), 0); }

  function addToBag(note) {
    const bag = getBag();
    if (bag.find(i => i.id === note.id)) return bag;
    const item = {
      id:            note.id,
      title:         note.title || note.chapterTitle,
      courseName:    note.courseName,
      chapterNumber: note.chapterNumber,
      chapterTitle:  note.chapterTitle,
      price:         Number(note.price),
    };
    const updated = [...bag, item];
    write(BAG, updated);
    return updated;
  }

  function removeFromBag(noteId) {
    const updated = getBag().filter(i => i.id !== noteId);
    write(BAG, updated);
    return updated;
  }

  /* ── Simulated download ────────────────────────────────────── */
  function fakeDownload(filename) {
    const text = `[Notati] Placeholder for ${filename}.\nIn production the real PDF is served by the API.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.NotatiStore = {
    getSession, clearSession,
    canReadNote,
    getBag, addToBag, removeFromBag, clearBag, getBagTotal,
    fakeDownload,
  };
})();
