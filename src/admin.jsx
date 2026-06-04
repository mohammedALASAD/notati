/* ============================================================
   Notati Prototype — Admin views
   - AdminDashboard:    overview stats + recent inbox + recent notes
   - ContentInbox:      table of all uploaded files, filter + download
   - UploadNoteModal:   per-submission, attach PDF + metadata
   - NotesManager:      list/edit/delete published Notes
   - UsersList:         registered users table
   All persist via NotatiStore.
   ============================================================ */

const { useState: useStateAd, useMemo: useMemoAd, useEffect: useEffectAd } = React;

const COLLEGES_AD = [
  'College of Arts',
  'College of Applied Studies',
  'College of Business Administration',
  'College of Engineering',
  'College of Health and Sport Sciences',
  'College of Information Technology',
  'College of Law',
  'College of Science'
];

const PRICES = [
  { val: 0, lbl: 'Free' },
  ...Array.from({ length: 20 }, (_, i) => {
    const v = (i + 1) * 0.5;
    return { val: v, lbl: `${v % 1 === 0 ? v : v} BD` };
  })
];

function fmtPrice(price) {
  const p = price != null ? Number(price) : 0;
  return p === 0 ? 'Free' : `BD ${p.toFixed(3)}`;
}

/* ---------- shared lookup ---------- */
function uploaderOf(upload, users) {
  return users.find(u => u.id === upload.userId) || { name: 'Unknown', email: '—' };
}

/* ============================================================
   Admin Dashboard
   ============================================================ */
function AdminDashboard({ user, onNav }) {
  const [users,   setUsers]   = useStateAd([]);
  const [uploads, setUploads] = useStateAd([]);
  const [notes,   setNotes]   = useStateAd([]);

  function loadAll() {
    return Promise.all([NotatiAPI.getUsers(), NotatiAPI.getUploads(), NotatiAPI.getNotes()])
      .then(([u, up, n]) => { setUsers(u); setUploads(up); setNotes(n); });
  }

  useEffectAd(() => { loadAll(); }, []);
  useEffectAd(() => {
    window.addEventListener('focus', loadAll);
    return () => window.removeEventListener('focus', loadAll);
  }, []);

  const pending   = uploads.filter(u => u.status === 'pending');
  const reviewed  = uploads.filter(u => u.status === 'reviewed');
  const customers = users.filter(u => u.role === 'customer');
  const recentInbox = uploads.slice(0, 5);
  const recentNotes = notes.slice(0, 3);

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">01 · Overview</span>
          <h1>Hey {user.name.split(' ')[0]} — here's the room.</h1>
          <p className="sub">A quick read on the inbox, the library, and who's joined this week. Anything pending is yours to turn around.</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => onNav('inbox')}>
            Open inbox <Icons.ArrowRight size={16}/>
          </button>
          <button className="btn btn-primary" onClick={() => onNav('notes')}>
            Manage notes <Icons.Notes size={16}/>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats">
        <Stat hero label="Pending reviews"
              num={pending.length}
              delta={{ dir: pending.length > 0 ? 'up' : '', text: pending.length > 0 ? `${pending.length} need your eyes` : 'All clear · nice work' }}
              icon="Clock"/>
        <Stat tone="walnut" label="Total uploads" num={uploads.length}
              delta={{ text: `${reviewed.length} reviewed · ${pending.length} pending` }}
              icon="Inbox"/>
        <Stat tone="sage" label="Published notes" num={notes.length}
              delta={{ dir: 'up', text: '+1 this week' }}
              icon="Notes"/>
        <Stat tone="amber" label="Registered users" num={users.length}
              delta={{ text: `${customers.length} students` }}
              icon="Users"/>
      </div>

      {/* Recent inbox + recent notes */}
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h3>Recent submissions</h3>
            <span className="sub">Latest five files from students</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('inbox')}>
              View all <Icons.ArrowRight size={14}/>
            </button>
          </div>
          <div className="panel-body flush">
            {recentInbox.length === 0 ? (
              <div style={{ padding: 30 }}>
                <EmptyState title="Nothing to review yet"
                            message="When students upload slides, decks, or scans, they land here."/>
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>From</th>
                    <th>When</th>
                    <th className="r">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInbox.map(up => {
                    const who = uploaderOf(up, users);
                    return (
                      <tr key={up.id} style={{ cursor: 'pointer' }} onClick={() => onNav('inbox')}>
                        <td data-l="File">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <FileTypeChip type={up.fileType}/>
                            <div className="name-cell">
                              <span className="nm">{up.title}</span>
                              <span className="em">{up.fileName}</span>
                            </div>
                          </div>
                        </td>
                        <td data-l="From">
                          <div className="uploader-cell">
                            <span className="avatar-sm">{who.name.charAt(0)}</span>
                            <div className="meta">
                              <span className="nm">{who.name}</span>
                              <span className="em">{who.email}</span>
                            </div>
                          </div>
                        </td>
                        <td data-l="When">{fmtRelative(up.uploadedAt)}</td>
                        <td className="r" data-l="Status"><StatusBadge status={up.status}/></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="panel" style={{ background: 'var(--notati-cream)' }}>
          <div className="panel-head" style={{ borderBottomColor: 'var(--border-2)' }}>
            <h3>Latest notes</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('notes')}>
              All notes <Icons.ArrowRight size={14}/>
            </button>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recentNotes.length === 0 ? (
              <EmptyState title="No notes yet" message="Publish your first Note from any pending submission."/>
            ) : recentNotes.map(n => (
              <div key={n.id} style={{ background: 'var(--notati-paper)', borderRadius: 'var(--r-5)',
                                       padding: 14, border: '1px solid var(--border-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="tag tag-walnut">{n.courseName}</span>
                  {n.chapterNumber && <span className="tag tag-soft">Ch.{n.chapterNumber}</span>}
                  <span style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                    {fmtRelative(n.publishedAt)}
                  </span>
                </div>
                <div style={{ font: 'var(--type-h3)', fontSize: 15, color: 'var(--fg-1)', marginBottom: 4 }}>
                  {n.title}
                </div>
                <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                  {n.college}{n.chapterTitle ? ` · ${n.chapterTitle}` : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   Content Inbox — all uploaded files with filter + download + review action
   ============================================================ */
function ContentInbox({ user, onPublish }) {
  const { toast } = useToast();
  const [users,   setUsers]   = useStateAd([]);
  const [uploads, setUploads] = useStateAd([]);
  const [q, setQ] = useStateAd('');
  const [filter, setFilter] = useStateAd('all');
  const [typeFilter, setTypeFilter] = useStateAd('all');

  function refresh() {
    Promise.all([NotatiAPI.getUploads(), NotatiAPI.getUsers()])
      .then(([up, u]) => { setUploads(up); setUsers(u); });
  }

  useEffectAd(() => { refresh(); }, []);

  const filtered = useMemoAd(() => {
    const ql = q.trim().toLowerCase();
    return uploads.filter(up => {
      if (filter !== 'all' && up.status !== filter) return false;
      if (typeFilter !== 'all' && up.fileType !== typeFilter) return false;
      if (!ql) return true;
      const who = uploaderOf(up, users);
      return [up.title, up.college, up.courseName, up.chapterTitle, up.fileName, who.name, who.email].some(s => (s || '').toLowerCase().includes(ql));
    });
  }, [uploads, q, filter, typeFilter, users]);

  function handleDownload(up) {
    if (up.fileUrl) { window.open(up.fileUrl, '_blank'); return; }
    NotatiStore.fakeDownload(up.fileName || up.title);
    toast.success('Download started', up.fileName || up.title);
  }

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">02 · Inbox</span>
          <h1>Content inbox</h1>
          <p className="sub">Every file students have submitted, oldest pending first. Open one to publish a Note back.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="filters" style={{ margin: 0 }}>
            {['all', 'pending', 'reviewed'].map(k => (
              <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setFilter(k)} style={{ borderRadius: 'var(--r-pill)' }}>
                {{ all: 'All', pending: 'Pending', reviewed: 'Reviewed' }[k]}
                <span style={{ opacity: .6, marginLeft: 4 }}>
                  {k === 'all' ? uploads.length : uploads.filter(u => u.status === k).length}
                </span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                    style={{ font: 'var(--type-body)', padding: '7px 14px',
                             borderRadius: 'var(--r-pill)', border: '1px solid var(--border-1)',
                             background: 'var(--notati-paper)' }}>
              <option value="all">All types</option>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="pptx">PPTX</option>
            </select>
            <div className="search-mini" style={{ minWidth: 260 }}>
              <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filename, title, student…"/>
            </div>
          </div>
        </div>

        <div className="panel-body flush">
          {filtered.length === 0 ? (
            <div style={{ padding: 30 }}>
              <EmptyState title="No submissions match these filters"
                          message="Try clearing the search or switching to All to see everything."/>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Uploader</th>
                  <th>Type</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(up => {
                  const who = uploaderOf(up, users);
                  return (
                    <tr key={up.id}>
                      <td data-l="Submission">
                        <div className="name-cell" style={{ maxWidth: 340 }}>
                          <span className="nm">{up.title}</span>
                          <span className="em">{up.fileName} · {fmtSize(up.sizeKB)}</span>
                        </div>
                      </td>
                      <td data-l="Uploader">
                        <div className="uploader-cell">
                          <span className="avatar-sm">{who.name.charAt(0)}</span>
                          <div className="meta">
                            <span className="nm">{who.name}</span>
                            <span className="em">{who.email}</span>
                          </div>
                        </div>
                      </td>
                      <td data-l="Type"><FileTypeChip type={up.fileType}/></td>
                      <td data-l="Uploaded">{fmtDate(up.uploadedAt)}</td>
                      <td data-l="Status"><StatusBadge status={up.status}/></td>
                      <td className="r" data-l="Actions">
                        <div className="row-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(up)} title="Download original">
                            <Icons.Download size={15}/>
                          </button>
                          {up.status === 'pending'
                            ? <button className="btn btn-primary btn-sm" onClick={() => onPublish(up)}>
                                Publish note <Icons.ArrowRight size={14}/>
                              </button>
                            : <button className="btn btn-soft btn-sm" onClick={() => onPublish(up)}>
                                <Icons.Edit size={14}/> Update
                              </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   Upload-Note modal — admin attaches a PDF + metadata to a submission
   ============================================================ */
function UploadNoteModal({ open, onClose, upload, user, onPublished, existingNote }) {
  const { toast } = useToast();
  const [title, setTitle]               = useStateAd('');
  const [college, setCollege]           = useStateAd('');
  const [courseName, setCourseName]     = useStateAd('');
  const [chapterNumber, setChapterNumber] = useStateAd('');
  const [chapterTitle, setChapterTitle] = useStateAd('');
  const [price, setPrice]               = useStateAd(0);
  const [tags, setTags]                 = useStateAd('');
  const [description, setDescription]   = useStateAd('');
  const [pdfName, setPdfName]           = useStateAd('');
  const [pdfSize, setPdfSize]           = useStateAd(0);
  const [pdfFile, setPdfFile]           = useStateAd(null);
  const [busy, setBusy]                 = useStateAd(false);
  const [err, setErr]                   = useStateAd('');

  useEffectAd(() => {
    if (open) {
      if (existingNote) {
        setTitle(existingNote.title);
        setCollege(existingNote.college || '');
        setCourseName(existingNote.courseName || '');
        setChapterNumber(existingNote.chapterNumber || '');
        setChapterTitle(existingNote.chapterTitle || '');
        setPrice(existingNote.price != null ? Number(existingNote.price) : 0);
        setTags(existingNote.tags.join(', '));
        setDescription(existingNote.description);
        setPdfName(existingNote.fileName);
        setPdfSize(existingNote.sizeKB);
      } else {
        setTitle(upload && upload.chapterTitle ? upload.chapterTitle : '');
        setCollege(upload ? upload.college || '' : '');
        setCourseName(upload ? upload.courseName || '' : '');
        setChapterNumber(upload ? upload.chapterNumber || '' : '');
        setChapterTitle(upload ? upload.chapterTitle || '' : '');
        setPrice(0);
        setTags('');
        setDescription(upload ? upload.description || '' : '');
        setPdfName(''); setPdfSize(0);
      }
      setErr('');
    }
  }, [open, upload, existingNote]);

  function pickPdf(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setErr('Notes must be a PDF.'); return;
    }
    setPdfName(f.name);
    setPdfSize(Math.max(1, Math.round(f.size / 1024)));
    setPdfFile(f);
    setErr('');
  }

  async function publish() {
    if (!college)                { setErr('Please select a college.'); return; }
    if (!courseName.trim())      { setErr('Course name is required.'); return; }
    if (!String(chapterNumber).trim()) { setErr('Chapter number is required.'); return; }
    if (!chapterTitle.trim())    { setErr('Chapter title is required.'); return; }
    setBusy(true); setErr('');
    try {
      const course = await NotatiAPI.findOrCreateCourse(courseName.trim(), college);
      if (existingNote) {
        const payload = {
          course: course.id,
          chapter_number: Number(chapterNumber),
          chapter_title:  chapterTitle.trim(),
          description:    description.trim(),
          price:          Number(price),
        };
        await NotatiAPI.updateNote(existingNote._numId, payload);
        toast.success('Note updated', `Ch.${chapterNumber} is live.`);
      } else {
        const fd = new FormData();
        fd.append('course',          course.id);
        fd.append('chapter_number',  chapterNumber);
        fd.append('chapter_title',   chapterTitle.trim());
        fd.append('description',     description.trim());
        fd.append('price',           price);
        if (pdfFile) fd.append('pdf_file', pdfFile);
        await NotatiAPI.createNote(fd);
        toast.success('Note published', `Ch.${chapterNumber} is live in the library.`);
      }
      onPublished && onPublished();
      onClose();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg"
           title={existingNote ? 'Edit published note' : 'Publish note for this submission'}
           subtitle={upload
             ? `Linked to: ${upload.title} · ${upload.fileName}`
             : 'Standalone note — not linked to a specific submission.'}
           footer={<>
             <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
             <button className="btn btn-primary" onClick={publish} disabled={busy}>
               {busy ? 'Saving...' : (existingNote ? 'Save changes' : 'Publish note')}
               {!busy && <Icons.Check size={16}/>}
             </button>
           </>}>
      <div className="field">
        <label>Note title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder="e.g. Motivation, in plain English"/>
        <div className="hint">Sentence case · keep it conversational, like a friend's lecture recap.</div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>College</label>
          <select value={college} onChange={(e) => setCollege(e.target.value)}>
            <option value="">Select college…</option>
            {COLLEGES_AD.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Course name</label>
          <input value={courseName} onChange={(e) => setCourseName(e.target.value)}
                 placeholder="e.g. MGMT 233, ACC112"/>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Chapter number</label>
          <input value={chapterNumber} onChange={(e) => setChapterNumber(e.target.value)}
                 placeholder="e.g. 4"/>
        </div>
        <div className="field">
          <label>Chapter title</label>
          <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)}
                 placeholder="e.g. Motivation Theories"/>
        </div>
      </div>
      <div className="field">
        <label>Access &amp; price</label>
        <select value={price} onChange={(e) => setPrice(Number(e.target.value))}>
          {PRICES.map(p => <option key={p.val} value={p.val}>{p.lbl}</option>)}
        </select>
        <div className="hint">
          Free — all students can read without paying. Paid — student must contact you via BenefitPay first.
        </div>
      </div>

      <div className="field">
        <label>Tags <span style={{ opacity: .5, textTransform: 'none', letterSpacing: 0 }}>(comma-separated)</span></label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Management, Chapter 4, Motivation"/>
      </div>
      <div className="field">
        <label>Short description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="One or two sentences in the Notati voice — what the student gets out of these notes."/>
      </div>

      <label style={{ font: 'var(--type-label)', letterSpacing: '.08em', textTransform: 'uppercase',
                      color: 'var(--fg-3)', display: 'block', margin: '4px 0 8px' }}>
        Notes PDF
      </label>
      <div className={`dropzone ${pdfName ? 'picked' : ''}`}>
        <div className="stack" aria-hidden="true">
          <div className="sheet s1"></div>
          <div className="sheet s2"></div>
          <div className="sheet s3"></div>
        </div>
        {pdfName ? (
          <div style={{ flex: 1 }}>
            <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', marginBottom: 4 }}>{pdfName}</div>
            <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
              {fmtSize(pdfSize)} · Ready to publish
            </div>
          </div>
        ) : (
          <>
            <h4>Drop the finished PDF here</h4>
            <p>Or click to browse — PDF only, up to 25 MB.</p>
            <span className="types">PDF</span>
          </>
        )}
        <input type="file" accept=".pdf,application/pdf" onChange={pickPdf}/>
      </div>
      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}
    </Modal>
  );
}

/* ============================================================
   Notes Manager — list / edit / delete published notes
   ============================================================ */
function NotesManager({ user, onEdit, onAddNew }) {
  const { toast } = useToast();
  const [notes, setNotes] = useStateAd([]);
  const [q, setQ] = useStateAd('');
  const [confirmDel, setConfirmDel] = useStateAd(null);

  function refresh() { NotatiAPI.getNotes().then(n => setNotes(n)).catch(() => {}); }
  useEffectAd(() => { refresh(); }, []);

  const filtered = useMemoAd(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return notes;
    return notes.filter(n =>
      [n.title, n.college, n.courseName, n.chapterTitle, n.description].some(s => (s || '').toLowerCase().includes(ql))
    );
  }, [q, notes]);

  async function doDelete() {
    if (!confirmDel) return;
    try {
      await NotatiAPI.deleteNote(confirmDel._numId);
      toast.success('Note removed', `Ch.${confirmDel.chapterNumber} is no longer published.`);
      setConfirmDel(null);
      refresh();
    } catch(e2) {
      toast.error('Could not delete', e2.message);
    }
  }

  function preview(n) {
    if (n.pdfFile) { window.open(n.pdfFile, '_blank'); return; }
    NotatiStore.fakeDownload(n.fileName || n.title + '.pdf');
    toast.info('Opened preview', n.fileName || n.title);
  }

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">04 · Notes</span>
          <h1>Published notes</h1>
          <p className="sub">Everything you've shipped to the library. Edit metadata, swap the PDF, or pull it offline when something changes.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={onAddNew}>
            <Icons.Plus size={16}/> New note
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>{filtered.length} notes</h3>
          <div className="search-mini" style={{ minWidth: 280 }}>
            <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes by title, subject, tag…"/>
          </div>
        </div>
        <div className="panel-body flush">
          {filtered.length === 0 ? (
            <div style={{ padding: 30 }}>
              <EmptyState title="No notes match that search"
                          message="Try a broader term, or hit New note to publish something fresh."
                          action={<button className="btn btn-primary" onClick={onAddNew}>
                                    <Icons.Plus size={16}/> New note
                                  </button>}/>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Note</th>
                  <th>College · Course</th>
                  <th>Price</th>
                  <th>Tags</th>
                  <th>Published</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(n => (
                  <tr key={n.id}>
                    <td data-l="Note">
                      <div className="name-cell" style={{ maxWidth: 360 }}>
                        <span className="nm">{n.title}</span>
                        <span className="em">{n.fileName} · {fmtSize(n.sizeKB)}</span>
                      </div>
                    </td>
                    <td data-l="College · Course">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>{n.college}</span>
                        <span className="tag tag-walnut">{n.courseName}</span>
                      </div>
                    </td>
                    <td data-l="Price">
                      <span className={`tag ${!n.price || n.price === 0 ? 'tag-soft' : 'tag-bark'}`}
                            style={{ fontWeight: 700 }}>
                        {fmtPrice(n.price)}
                      </span>
                    </td>
                    <td data-l="Tags">
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {n.tags.slice(0, 3).map(t => <span key={t} className="tag tag-soft">{t}</span>)}
                        {n.tags.length > 3 ? <span style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>+{n.tags.length - 3}</span> : null}
                      </div>
                    </td>
                    <td data-l="Published">{fmtDate(n.publishedAt)}</td>
                    <td className="r" data-l="Actions">
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" title="Preview" onClick={() => preview(n)}>
                          <Icons.Eye size={15}/>
                        </button>
                        <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => onEdit(n)}>
                          <Icons.Edit size={15}/>
                        </button>
                        <button className="btn btn-danger btn-sm" title="Delete" onClick={() => setConfirmDel(n)}>
                          <Icons.Trash size={15}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)}
             title="Pull this note offline?"
             subtitle="Students will no longer see it in the library. The original submission goes back to pending."
             footer={<>
               <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Keep it</button>
               <button className="btn btn-primary" style={{ background: 'var(--notati-crimson)', borderColor: 'var(--notati-crimson)' }}
                       onClick={doDelete}>
                 <Icons.Trash size={15}/> Delete note
               </button>
             </>}>
        {confirmDel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <FileTypeChip type="pdf"/>
            <div>
              <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)' }}>{confirmDel.title}</div>
              <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                {confirmDel.courseName} · Ch.{confirmDel.chapterNumber} · published {fmtDate(confirmDel.publishedAt)}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ============================================================
   Users List
   ============================================================ */
function UsersList() {
  const [users,   setUsers]   = useStateAd([]);
  const [uploads, setUploads] = useStateAd([]);
  const [q, setQ] = useStateAd('');
  const [role, setRole] = useStateAd('all');

  useEffectAd(() => {
    Promise.all([NotatiAPI.getUsers(), NotatiAPI.getUploads()])
      .then(([u, up]) => { setUsers(u); setUploads(up); });
  }, []);
  const filtered = useMemoAd(() => {
    const ql = q.trim().toLowerCase();
    return users.filter(u => {
      if (role !== 'all' && u.role !== role) return false;
      if (!ql) return true;
      return [u.name, u.email, u.role].some(s => (s || '').toLowerCase().includes(ql));
    });
  }, [users, q, role]);

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">05 · Users</span>
          <h1>Registered users</h1>
          <p className="sub">Everyone with a Notati account. Students sign up themselves; admins are seeded.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="filters" style={{ margin: 0 }}>
            {[
              { id: 'all',      label: 'All',       count: users.length },
              { id: 'customer', label: 'Students',  count: users.filter(u => u.role === 'customer').length },
              { id: 'admin',    label: 'Admins',    count: users.filter(u => u.role === 'admin').length }
            ].map(o => (
              <button key={o.id} className={`btn btn-sm ${role === o.id ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setRole(o.id)}>
                {o.label} <span style={{ opacity: .6, marginLeft: 4 }}>{o.count}</span>
              </button>
            ))}
          </div>
          <div className="search-mini" style={{ minWidth: 280, marginLeft: 'auto' }}>
            <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…"/>
          </div>
        </div>

        <div className="panel-body flush">
          {filtered.length === 0 ? (
            <div style={{ padding: 30 }}>
              <EmptyState title="No matches" message="Try a different name or email."/>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th className="r">Uploads</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const ups = uploads.filter(x => x.userId === u.id).length;
                  return (
                    <tr key={u.id}>
                      <td data-l="Name">
                        <div className="uploader-cell">
                          <span className="avatar-sm">{u.name.charAt(0)}</span>
                          <div className="meta">
                            <span className="nm">{u.name}</span>
                          </div>
                        </div>
                      </td>
                      <td data-l="Email"><span style={{ color: 'var(--fg-2)' }}>{u.email}</span></td>
                      <td data-l="Role">
                        <span className={`tag ${u.role === 'admin' ? 'tag-bark' : 'tag-soft'}`}>
                          {u.role === 'admin' ? 'Admin' : 'Student'}
                        </span>
                      </td>
                      <td data-l="Joined">{fmtDate(u.joinedAt || u.created_at)}</td>
                      <td className="r" data-l="Uploads">
                        <span style={{ font: 'var(--type-body-bold)' }}>{ups}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   Access Manager — admin grants / revokes access after BenefitPay payment
   ============================================================ */
function AccessManager() {
  const { toast } = useToast();
  const [email, setEmail]               = useStateAd('');
  const [foundUser, setFoundUser]       = useStateAd(null);
  const [notFound, setNotFound]         = useStateAd(false);
  const [accessMap, setAccessMap]       = useStateAd({}); // { noteNumId: accessId }
  const [noteQ, setNoteQ]               = useStateAd('');
  const [accessFilter, setAccessFilter] = useStateAd('all');
  const [notes, setNotes]               = useStateAd([]);
  const [users, setUsers]               = useStateAd([]);

  useEffectAd(() => {
    Promise.all([NotatiAPI.getNotes(), NotatiAPI.getUsers()])
      .then(([n, u]) => { setNotes(n); setUsers(u); });
  }, []);

  async function searchUser(e) {
    e && e.preventDefault();
    const emailLower = email.trim().toLowerCase();
    const u = users.find(x => x.email.toLowerCase() === emailLower && x.role !== 'admin');
    if (u) {
      setFoundUser(u);
      setNotFound(false);
      setNoteQ('');
      setAccessFilter('all');
      try {
        const access = await NotatiAPI.getAccessList(u.id);
        const map = {};
        access.forEach(a => { map[String(a.note)] = a.id; });
        setAccessMap(map);
      } catch(e2) {
        toast.error('Could not load access', e2.message);
      }
    } else {
      setFoundUser(null);
      setNotFound(true);
      setAccessMap({});
    }
  }

  async function grant(note) {
    if (!foundUser) return;
    try {
      const a = await NotatiAPI.grantAccess(foundUser.id, note._numId);
      setAccessMap(prev => ({ ...prev, [String(note._numId)]: a.id }));
      toast.success('Access granted', `${foundUser.name} can now read Ch.${note.chapterNumber}.`);
    } catch(e2) {
      toast.error('Could not grant', e2.message);
    }
  }

  async function revoke(note) {
    if (!foundUser) return;
    const accessId = accessMap[String(note._numId)];
    if (!accessId) return;
    try {
      await NotatiAPI.revokeAccess(accessId);
      setAccessMap(prev => { const m = { ...prev }; delete m[String(note._numId)]; return m; });
      toast.info('Access removed', `${foundUser.name} no longer has access to Ch.${note.chapterNumber}.`);
    } catch(e2) {
      toast.error('Could not revoke', e2.message);
    }
  }

  const groupedNotes = useMemoAd(() => {
    const ql = noteQ.trim().toLowerCase();
    const filtered = notes.filter(n => {
      const isFree = !n.price || Number(n.price) === 0;
      const owned  = !!accessMap[String(n._numId)];
      if (accessFilter === 'granted' && !(owned || isFree)) return false;
      if (accessFilter === 'locked'  && (owned || isFree))  return false;
      if (!ql) return true;
      return [n.title, n.courseName, n.chapterTitle, n.college, String(n.chapterNumber)].some(
        s => (s || '').toLowerCase().includes(ql)
      );
    });
    const map = {};
    filtered.forEach(n => {
      if (!map[n.courseName]) map[n.courseName] = { courseName: n.courseName, college: n.college, notes: [] };
      map[n.courseName].notes.push(n);
    });
    Object.values(map).forEach(g => g.notes.sort((a, b) => Number(a.chapterNumber) - Number(b.chapterNumber)));
    return Object.values(map).sort((a, b) => a.courseName.localeCompare(b.courseName));
  }, [notes, noteQ, accessFilter, accessMap]);

  const paidNotes   = notes.filter(n => n.price && Number(n.price) > 0);
  const grantedPaid = paidNotes.filter(n => !!accessMap[String(n._numId)]).length;

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">06 · Access</span>
          <h1>Unlock access</h1>
          <p className="sub">
            After receiving a BenefitPay payment, find the student by email then grant them access to the chapter they paid for.
          </p>
        </div>
      </div>

      {/* Step 1 — find student */}
      <section className="panel">
        <div className="panel-head"><h3>1 · Find student</h3></div>
        <div className="panel-body">
          <form onSubmit={searchUser} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', maxWidth: 540 }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label>Student email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="e.g. mariam@uob.edu.bh" type="email" required/>
            </div>
            <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>
              <Icons.Search size={15}/> Find
            </button>
          </form>
          {notFound && (
            <div className="err" style={{ marginTop: 14 }}>No student found with that email address.</div>
          )}
        </div>
      </section>

      {/* Step 2 — manage access */}
      {foundUser && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <h3>2 · Manage access</h3>
          </div>
          <div className="panel-body">

            {/* Student card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14,
                          padding: '14px 18px', background: 'var(--notati-cream)',
                          border: '1px solid var(--border-2)', borderRadius: 'var(--r-5)',
                          marginBottom: 20 }}>
              <span className="avatar-sm" style={{ width: 40, height: 40, fontSize: 18 }}>
                {foundUser.name.charAt(0)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', marginBottom: 2 }}>{foundUser.name}</div>
                <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                  {foundUser.email} · Joined {fmtDate(foundUser.joinedAt)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ font: 'var(--type-h3)', color: 'var(--notati-walnut)', fontSize: 22, fontWeight: 800 }}>
                  {grantedPaid}
                </div>
                <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 11, color: 'var(--fg-3)' }}>
                  paid chapters unlocked
                </div>
              </div>
            </div>

            {/* Search + filter bar */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
              <div className="search-mini" style={{ flex: 1, minWidth: 220 }}>
                <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
                <input value={noteQ} onChange={(e) => setNoteQ(e.target.value)}
                       placeholder="Search by course, chapter, or title…"/>
              </div>
              <div className="filters" style={{ margin: 0 }}>
                {[
                  { id: 'all',     label: 'All notes' },
                  { id: 'granted', label: 'Has access' },
                  { id: 'locked',  label: 'Locked' }
                ].map(o => (
                  <button key={o.id}
                          className={`btn btn-sm ${accessFilter === o.id ? 'btn-primary' : 'btn-soft'}`}
                          onClick={() => setAccessFilter(o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes grouped by course */}
            {notes.length === 0 ? (
              <EmptyState title="No published notes" message="Publish some notes first."/>
            ) : groupedNotes.length === 0 ? (
              <EmptyState title="No matches" message="Try a different search term or filter."/>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {groupedNotes.map(({ courseName, college, notes: cNotes }) => (
                  <div key={courseName}>
                    {/* Course header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span className="tag tag-walnut" style={{ fontSize: 12 }}>{courseName}</span>
                      <span style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                        {college}
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border-2)' }}/>
                      <span style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                        {cNotes.length} chapter{cNotes.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Chapter rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {cNotes.map(n => {
                        const owned   = !!accessMap[String(n._numId)];
                        const isFree  = !n.price || Number(n.price) === 0;
                        return (
                          <div key={n.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px', borderRadius: 'var(--r-5)',
                            border: '1px solid var(--border-1)',
                            background: isFree ? 'var(--notati-cream)' : owned ? '#f0faf4' : 'var(--notati-paper)'
                          }}>
                            {/* Chapter bubble */}
                            <div style={{ width: 36, height: 36, borderRadius: 'var(--r-3)', flexShrink: 0,
                                          background: isFree ? 'var(--notati-sage)' : owned ? 'var(--notati-walnut)' : 'var(--notati-cream)',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          color: (isFree || owned) ? 'var(--notati-paper)' : 'var(--fg-3)',
                                          fontSize: 14, fontWeight: 700 }}>
                              {n.chapterNumber}
                            </div>

                            {/* Chapter info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--fg-1)', fontSize: 14 }}>
                                  Ch.{n.chapterNumber}: {n.chapterTitle}
                                </span>
                                {isFree ? (
                                  <span className="tag tag-soft" style={{ fontSize: 10 }}>FREE</span>
                                ) : (
                                  <span className="tag tag-bark" style={{ fontSize: 10 }}>BD {Number(n.price).toFixed(3)}</span>
                                )}
                              </div>
                              <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12,
                                            color: 'var(--fg-3)', marginTop: 2, whiteSpace: 'nowrap',
                                            overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {n.title}
                              </div>
                            </div>

                            {/* Action */}
                            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                              {isFree ? (
                                <span style={{ font: 'var(--type-label)', fontSize: 11, color: 'var(--fg-3)' }}>
                                  Free for everyone
                                </span>
                              ) : owned ? (
                                <>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                                                 color: 'var(--notati-sage)', font: 'var(--type-label)', fontSize: 12 }}>
                                    <Icons.Check size={14}/> Has access
                                  </span>
                                  <button className="btn btn-danger btn-sm" onClick={() => revoke(n)}>
                                    <Icons.Close size={12}/> Revoke
                                  </button>
                                </>
                              ) : (
                                <button className="btn btn-primary btn-sm" onClick={() => grant(n)}>
                                  <Icons.Lock size={12}/> Grant access
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

Object.assign(window, { AdminDashboard, ContentInbox, UploadNoteModal, NotesManager, UsersList, AccessManager });
