/* ============================================================
   Notati — API client
   Talks to the Django REST backend.
   Base URL: window.NOTATI_API_URL (set in index.html for prod)
             or http://localhost:8000/api (default for dev)
   ============================================================ */
(function () {
  const BASE = (window.NOTATI_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');
  const NS   = 'notati:v6';
  const KEYS = {
    token:   NS + ':token',
    refresh: NS + ':refresh',
    user:    NS + ':user_data',
  };

  /* ── token helpers ────────────────────────────────────────── */
  function getToken()    { try { return localStorage.getItem(KEYS.token); } catch(e) { return null; } }
  function getRefresh()  { try { return localStorage.getItem(KEYS.refresh); } catch(e) { return null; } }
  function setToken(t)   { try { localStorage.setItem(KEYS.token, t); } catch(e) {} }
  function setRefresh(t) { try { localStorage.setItem(KEYS.refresh, t); } catch(e) {} }
  function clearTokens() {
    try {
      [KEYS.token, KEYS.refresh, KEYS.user].forEach(k => localStorage.removeItem(k));
    } catch(e) {}
  }

  /* Exchange the long-lived refresh token for a fresh access token.
     A single in-flight request is shared so a burst of 401s only refreshes once.
     Returns true on success. */
  let _refreshing = null;
  function refreshAccessToken() {
    const refresh = getRefresh();
    if (!refresh) return Promise.resolve(false);
    if (!_refreshing) {
      _refreshing = fetch(BASE + '/auth/token/refresh/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      }).then(async (r) => {
        if (!r.ok) return false;
        const data = await r.json().catch(() => ({}));
        if (data && data.access) {
          setToken(data.access);
          if (data.refresh) setRefresh(data.refresh);   // ROTATE_REFRESH_TOKENS is on
          return true;
        }
        return false;
      }).catch(() => false).finally(() => { _refreshing = null; });
    }
    return _refreshing;
  }

  /* ── stored user (fast boot, no extra round-trip) ────────── */
  function getStoredUser() {
    try { const s = localStorage.getItem(KEYS.user); return s ? JSON.parse(s) : null; }
    catch(e) { return null; }
  }
  function setStoredUser(u) {
    try { localStorage.setItem(KEYS.user, JSON.stringify(u)); } catch(e) {}
  }

  /* ── core fetch wrapper ───────────────────────────────────── */
  async function req(method, path, body, isFormData, _retried) {
    const token = getToken();
    const headers = {};
    if (!isFormData) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    let res;
    try {
      res = await fetch(BASE + path, opts);
    } catch (e) {
      throw new Error('Cannot reach server. Is the backend running?');
    }

    // The access token (1-day life) likely expired between sessions. Use the
    // refresh token to get a new one and retry once, so reopening the site keeps
    // working without a manual sign-out/sign-in.
    if (res.status === 401 && !_retried && getRefresh()
        && path !== '/auth/token/refresh/' && path !== '/auth/login/') {
      const ok = await refreshAccessToken();
      if (ok) return req(method, path, body, isFormData, true);
      // Refresh token is gone/expired too — the session is truly dead. Clear it
      // and reboot to the login screen instead of showing empty pages.
      clearTokens();
      if (typeof window !== 'undefined') window.location.reload();
    }

    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // DRF error shape: { detail: "..." } or { field: ["msg"] }
      const msg = data.detail
        || Object.entries(data).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join('; ')
        || res.statusText;
      throw new Error(msg);
    }

    return data;
  }

  /* ── shape adapters ───────────────────────────────────────── */
  function toUser(u) {
    return {
      id:       String(u.id),
      name:     u.name,
      email:    u.email,
      role:     u.role === 'admin' ? 'admin' : 'customer',
      college:  u.college || '',
      phone:    u.phone || '',
      joinedAt: u.created_at || '',
    };
  }

  function toNote(n) {
    const fileName = n.pdf_file ? n.pdf_file.split('/').pop() : '';
    return {
      id:            String(n.id),
      _numId:        n.id,
      courseId:      n.course,
      courseName:    n.course_name,
      college:       n.college || '',
      chapterNumber: String(n.chapter_number),
      chapterTitle:  n.chapter_title,
      title:         n.chapter_title,
      description:   n.description || '',
      price:         parseFloat(n.price || 0),
      isFree:        n.is_free,
      hasAccess:     n.has_access,
      pdfFile:       n.pdf_file || null,
      fileName:      fileName,
      tags:          [],
      publishedAt:   n.created_at,
      files:         (n.files || []).map(f => ({
        id:        f.id,
        label:     f.label || '',
        fileUrl:   f.file_url || null,
        filename:  f.filename || '',
        isLegacy:  f.is_legacy || false,
      })),
    };
  }

  function toUpload(u) {
    const fileName = u.file ? u.file.split('/').pop() : '';
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    return {
      id:            String(u.id),
      userId:        String(u.user),
      userEmail:     u.user_email,
      userName:      u.user_name,
      title:         u.title,
      description:   u.description || '',
      college:       u.college || '',
      courseName:    u.course_name || '',
      chapterNumber: u.chapter_number || '',
      chapterTitle:  u.chapter_title || u.title,
      status:        u.status,
      fileUrl:       u.file_url || null,
      fileName:      fileName,
      fileType:      ext,
      sizeKB:        0,
      noteId:        u.note ? String(u.note) : null,
      uploadedAt:    u.created_at,
      deleteAfter:   u.delete_after || null,
      autoDeleteAt:  u.auto_delete_at || null,
    };
  }

  /* ── list helper (handles paginated or plain arrays) ─────── */
  function list(data) { return Array.isArray(data) ? data : (data.results || []); }

  /* ── API ──────────────────────────────────────────────────── */
  const NotatiAPI = {

    /* Auth */
    async login(email, password) {
      const tokens = await req('POST', '/auth/login/', { email, password });
      setToken(tokens.access);
      try { localStorage.setItem(KEYS.refresh, tokens.refresh); } catch(e) {}
      const me = await req('GET', '/auth/me/');
      const user = toUser(me);
      setStoredUser(user);
      return user;
    },

    // Registration no longer logs in — it creates an inactive account and
    // emails a code. The user verifies (or resets) to receive tokens.
    async register(name, email, password, phone) {
      return req('POST', '/auth/register/', { name, email, password, phone });
    },

    async _loginWithTokens(tokens) {
      setToken(tokens.access);
      try { localStorage.setItem(KEYS.refresh, tokens.refresh); } catch(e) {}
      const me = await req('GET', '/auth/me/');
      const user = toUser(me);
      setStoredUser(user);
      return user;
    },

    async verifyEmail(email, code) {
      return NotatiAPI._loginWithTokens(await req('POST', '/auth/verify/', { email, code }));
    },

    async resendCode(email) {
      return req('POST', '/auth/resend/', { email });
    },

    async forgotPassword(email) {
      return req('POST', '/auth/password/forgot/', { email });
    },

    async resetPassword(email, code, newPassword) {
      return NotatiAPI._loginWithTokens(
        await req('POST', '/auth/password/reset/', { email, code, new_password: newPassword }));
    },

    async me() {
      const data = await req('GET', '/auth/me/');
      return toUser(data);
    },

    logout() { clearTokens(); },

    getStoredUser,
    getToken,
    isLoggedIn() { return !!getToken(); },
    warmup()     { fetch(BASE + '/notes/', { method: 'GET', mode: 'no-cors' }).catch(() => {}); },

    /* Courses */
    async getCourses() {
      const data = await req('GET', '/courses/');
      return list(data);
    },

    /* Notes */
    async getNotes(courseId) {
      const q = courseId ? `?course=${courseId}` : '';
      const data = await req('GET', '/notes/' + q);
      return list(data).map(toNote);
    },

    async getNote(id) {
      return toNote(await req('GET', `/notes/${id}/`));
    },

    async createNote(payload) {
      const isForm = payload instanceof FormData;
      return toNote(await req('POST', '/notes/', payload, isForm));
    },

    async updateNote(id, payload, isFormData) {
      return toNote(await req('PATCH', `/notes/${id}/`, payload, isFormData || false));
    },

    async deleteNote(id) {
      await req('DELETE', `/notes/${id}/`);
    },

    /* Access */
    async getAccessList(userId) {
      const q = userId ? `?user=${userId}` : '';
      const data = await req('GET', '/access/' + q);
      return list(data);
    },

    async getAccessListByNote(noteId) {
      const data = await req('GET', `/access/?note=${noteId}`);
      return list(data);
    },

    async getChapterRankings() {
      const data = await req('GET', '/admin/chapter-rankings/');
      return Array.isArray(data) ? data : [];
    },

    async getSalesData() {
      const data = await req('GET', '/admin/sales/');
      return data || { total_revenue: '0.000', total_sales: 0, rows: [] };
    },

    async getNoteViews() {
      const data = await req('GET', '/admin/note-views/');
      return Array.isArray(data) ? data : [];
    },

    async adminTrace(code) {
      return req('GET', '/admin/trace/?code=' + encodeURIComponent(code));
    },

    async grantAccess(userId, noteId) {
      return req('POST', '/access/', { user: Number(userId), note: Number(noteId) });
    },

    async revokeAccess(accessId) {
      await req('DELETE', `/access/${accessId}/`);
    },

    /* Note files */
    async getNoteFiles(noteId) {
      const data = await req('GET', `/note-files/?note=${noteId}`);
      return list(data);
    },
    async addNoteFile(noteId, file, label, order) {
      const fd = new FormData();
      fd.append('note', noteId);
      fd.append('file', file);
      fd.append('label', label || '');
      fd.append('order', order != null ? order : 0);
      return req('POST', '/note-files/', fd, true);
    },
    async deleteNoteFile(id) {
      await req('DELETE', `/note-files/${id}/`);
    },
    async downloadNoteFileById(id, filename) {
      await _proxyDownload(BASE + `/note-files/${id}/download/`, filename);
    },
    async previewNoteFileById(id) {
      await _proxyOpen(BASE + `/note-files/${id}/download/`);
    },
    /* Public sample preview (first pages clear, rest blurred) — no auth needed,
       so we open the URL directly in a new tab. Returns false if there's nothing
       to preview or the browser blocked the pop-up, so the caller can react. */
    openSample(note) {
      const files = (note && note.files) || [];
      const f = files[0];
      const url = (f && f.id)
        ? BASE + `/note-files/${f.id}/sample/`
        : (note && note._numId) ? BASE + `/notes/${note._numId}/sample/` : null;
      if (!url) return false;
      const w = window.open(url, '_blank');
      return !!w;
    },
    /* Sample a specific file by id. Returns false if blocked / no id. */
    openSampleFile(fileId) {
      if (!fileId) return false;
      const w = window.open(BASE + `/note-files/${fileId}/sample/`, '_blank');
      return !!w;
    },
    async previewNoteFilesById(ids) {
      // Open all tabs synchronously (still in user-gesture frame) before any await
      const wins = ids.map(() => window.open('about:blank', '_blank'));
      await Promise.all(ids.map(async (id, i) => {
        const blob = await _proxyFetch(BASE + `/note-files/${id}/download/`);
        const objectUrl = URL.createObjectURL(blob);
        if (wins[i]) wins[i].location.href = objectUrl;
        else window.open(objectUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      }));
    },

    /* Upload files */
    async getUploadFiles(uploadId) {
      const data = await req('GET', `/upload-files/?upload=${uploadId}`);
      return list(data);
    },
    async addUploadFile(uploadId, file, label) {
      const fd = new FormData();
      fd.append('upload', uploadId);
      fd.append('file', file);
      fd.append('label', label || '');
      return req('POST', '/upload-files/', fd, true);
    },
    async deleteUploadFile(id) {
      await req('DELETE', `/upload-files/${id}/`);
    },
    async downloadUploadFileById(id, filename) {
      await _proxyDownload(BASE + `/upload-files/${id}/download/`, filename);
    },

    /* Uploads */
    async getUploads() {
      const data = await req('GET', '/uploads/');
      return list(data).map(toUpload);
    },

    async submitUpload(formData) {
      const raw = await req('POST', '/uploads/', formData, true);
      return toUpload(raw);
    },

    async updateUpload(id, payload) {
      return req('PATCH', `/uploads/${id}/`, payload);
    },

    async deleteUpload(id) {
      await req('DELETE', `/uploads/${id}/`);
    },

    async setUploadTimer(id, deleteAfter) {
      const raw = await req('PATCH', `/uploads/${id}/`, { delete_after: deleteAfter });
      return toUpload(raw);
    },

    /* Courses: find by name or create */
    async findOrCreateCourse(name, college) {
      const data = await req('GET', '/courses/?search=' + encodeURIComponent(name));
      const all  = list(data);
      const hit  = all.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
      if (hit) return hit;
      return req('POST', '/courses/', { name: name.trim(), college: college || '' });
    },

    /* Admin */
    async getUsers() {
      const data = await req('GET', '/admin/users/');
      return list(data).map(toUser);
    },

    async getStats() {
      return req('GET', '/admin/stats/');
    },

    async downloadUploadFile(uploadId, filename) {
      await _proxyDownload(BASE + `/uploads/${uploadId}/download/`, filename);
    },

    async downloadNoteFile(noteId, filename) {
      await _proxyDownload(BASE + `/notes/${noteId}/download/`, filename);
    },

    async previewNoteFile(noteId) {
      await _proxyOpen(BASE + `/notes/${noteId}/download/`);
    },

    async previewUploadFile(uploadId) {
      await _proxyOpen(BASE + `/uploads/${uploadId}/download/`);
    },

    async fetchNoteObjectUrl(noteId) {
      const blob = await _proxyFetch(BASE + `/notes/${noteId}/download/`);
      return URL.createObjectURL(blob);
    },

    /* Testimonials */
    async getTestimonials() {
      const data = await req('GET', '/testimonials/');
      return list(data);
    },
    async submitTestimonial(payload) {
      return req('POST', '/testimonials/submit/', payload);
    },
    async getAdminTestimonials() {
      return list(await req('GET', '/admin/testimonials/'));
    },
    async updateTestimonial(id, payload) {
      return req('PATCH', `/admin/testimonials/${id}/`, payload);
    },
    async deleteTestimonial(id) {
      return req('DELETE', `/admin/testimonials/${id}/`);
    },

    async sendEmail(userId, subject, message) {
      return req('POST', '/admin/send-email/', { user_id: userId, subject, message });
    },

    async broadcastEmail(subject, message) {
      return req('POST', '/admin/broadcast-email/', { subject, message });
    },

    /* Bag (server-synced) */
    async getBag() {
      const data = await req('GET', '/bag/');
      return (Array.isArray(data) ? data : (data.results || [])).map(i => ({
        id:            String(i.note_id),
        _numId:        i.note_id,
        title:         i.title,
        chapterTitle:  i.title,
        courseName:    i.course_name,
        chapterNumber: String(i.chapter_number),
        price:         parseFloat(i.price),
      }));
    },
    async addBagItem(noteNumId)  { return req('POST',   '/bag/',       { note_id: noteNumId }); },
    async removeBagItem(noteNumId) { return req('DELETE', '/bag/',     { note_id: noteNumId }); },
    async clearBag()             { return req('DELETE', '/bag/clear/'); },

    /* Orders */
    async createOrder(noteIds, discountCode, code) {
      const body = {};
      if (noteIds && noteIds.length) body.note_ids = noteIds;
      if (discountCode) body.discount_code = discountCode;
      if (code) body.code = code;
      return req('POST', '/orders/', body);
    },
    async getOrders()      { return list(await req('GET', '/orders/')); },
    async getAdminOrders(orderStatus) {
      const q = orderStatus ? `?status=${orderStatus}` : '';
      return list(await req('GET', '/admin/orders/' + q));
    },
    async updateOrder(id, payload) { return req('PATCH', `/admin/orders/${id}/`, payload); },

    /* Discount codes */
    async validateDiscount(code) {
      // Throws (with a human message) if the code is not usable.
      return req('POST', '/discount/validate/', { code });
    },
    async getDiscounts()           { return list(await req('GET', '/admin/discounts/')); },
    async createDiscount(payload)  { return req('POST', '/admin/discounts/', payload); },
    async updateDiscount(id, payload) { return req('PATCH', `/admin/discounts/${id}/`, payload); },
    async deleteDiscount(id)       { return req('DELETE', `/admin/discounts/${id}/`); },

  };

  async function _proxyFetch(url, _retried) {
    const token = getToken();
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    const res = await fetch(url, { headers });
    if (res.status === 401 && !_retried && getRefresh()) {
      if (await refreshAccessToken()) return _proxyFetch(url, true);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Request failed');
    }
    return res.blob();
  }

  async function _proxyDownload(url, filename) {
    const blob = await _proxyFetch(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  async function _proxyOpen(url) {
    // Open the tab synchronously (inside the user-gesture frame) so browsers
    // don't block it. Then navigate it to the blob URL once the fetch is done.
    const win = window.open('about:blank', '_blank');
    const blob = await _proxyFetch(url);
    const objectUrl = URL.createObjectURL(blob);
    if (win) {
      win.location.href = objectUrl;
    } else {
      window.open(objectUrl, '_blank');
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  window.NotatiAPI = NotatiAPI;
})();
