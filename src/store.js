/* ============================================================
   Notati — Store
   Auth and access live in the Django API.
   Bag is server-synced (BagItem table) with a localStorage
   cache so the UI is instant while the request is in flight.
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
  function getSession()   { return NotatiAPI.getStoredUser(); }
  function clearSession() { NotatiAPI.logout(); }

  /* ── Access check ─────────────────────────────────────────── */
  function canReadNote(userId, note) {
    if (!note) return false;
    if (note.hasAccess !== undefined) return !!note.hasAccess;
    return Number(note.price || 0) === 0;
  }

  /* ── Bag ──────────────────────────────────────────────────── */
  function getBag()      { return read(BAG, []); }
  function getBagTotal() { return getBag().reduce((s, i) => s + Number(i.price), 0); }

  function _itemFromNote(note) {
    return {
      id:            note.id,
      _numId:        note._numId,
      title:         note.title || note.chapterTitle,
      courseName:    note.courseName,
      chapterNumber: note.chapterNumber,
      chapterTitle:  note.chapterTitle,
      price:         Number(note.price),
    };
  }

  /* Optimistic add: update cache instantly, sync to server */
  function addToBag(note) {
    const bag = getBag();
    if (bag.find(i => i.id === note.id)) return bag;
    const updated = [...bag, _itemFromNote(note)];
    write(BAG, updated);
    if (note._numId) NotatiAPI.addBagItem(note._numId).catch(() => {});
    return updated;
  }

  /* Optimistic remove */
  function removeFromBag(noteId) {
    const bag = getBag();
    const item = bag.find(i => i.id === noteId);
    const updated = bag.filter(i => i.id !== noteId);
    write(BAG, updated);
    if (item && item._numId) NotatiAPI.removeBagItem(item._numId).catch(() => {});
    return updated;
  }

  /* Clear both locally and on server */
  function clearBag() {
    write(BAG, []);
    NotatiAPI.clearBag().catch(() => {});
    return [];
  }

  /* Called on login: fetch server bag and merge with any local items */
  async function syncBagFromServer() {
    try {
      const serverItems = await NotatiAPI.getBag();
      const local = getBag();
      // Merge: server is source of truth, add any local-only items to server
      const serverIds = new Set(serverItems.map(i => i.id));
      const localOnly = local.filter(i => !serverIds.has(i.id));
      for (const item of localOnly) {
        if (item._numId) await NotatiAPI.addBagItem(item._numId).catch(() => {});
      }
      const merged = [...serverItems, ...localOnly];
      write(BAG, merged);
      return merged;
    } catch(e) {
      return getBag();
    }
  }

  window.NotatiStore = {
    getSession, clearSession,
    canReadNote,
    getBag, addToBag, removeFromBag, clearBag, getBagTotal,
    syncBagFromServer,
  };
})();
