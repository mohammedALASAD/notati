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
  const [loading, setLoading] = useStateAd(true);

  function loadAll() {
    return Promise.all([NotatiAPI.getUsers(), NotatiAPI.getUploads(), NotatiAPI.getNotes()])
      .then(([u, up, n]) => { setUsers(u); setUploads(up); setNotes(n); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffectAd(() => { loadAll(); }, []);
  useEffectAd(() => {
    window.addEventListener('focus', loadAll);
    return () => window.removeEventListener('focus', loadAll);
  }, []);

  const pending   = uploads.filter(u => u.status === 'pending');
  const reviewed  = uploads.filter(u => u.status === 'approved');
  const customers = users.filter(u => u.role === 'customer');
  const recentInbox = uploads.slice(0, 5);
  const recentNotes = notes.slice(0, 3);

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
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
      {loading ? <PageLoader variant="stats" rows={4}/> : (
        <div className="stats fade-in">
          <Stat hero label="Pending reviews"
                num={pending.length}
                delta={{ dir: pending.length > 0 ? 'up' : '', text: pending.length > 0 ? `${pending.length} need your eyes` : 'All clear · nice work' }}
                icon="Clock"
                onClick={() => onNav('inbox')} navLabel="Open inbox"/>
          <Stat tone="walnut" label="Total uploads" num={uploads.length}
                delta={{ text: `${reviewed.length} reviewed · ${pending.length} pending` }}
                icon="Inbox"
                onClick={() => onNav('inbox')} navLabel="View all uploads"/>
          <Stat tone="sage" label="Published notes" num={notes.length}
                delta={{ text: notes.length > 0 ? `${notes.length} in the library` : 'Nothing published yet' }}
                icon="Notes"
                onClick={() => onNav('notes')} navLabel="Manage notes"/>
          <Stat tone="amber" label="Registered users" num={users.length}
                delta={{ text: `${customers.length} students` }}
                icon="Users"
                onClick={() => onNav('users')} navLabel="View users"/>
        </div>
      )}

      {/* Recent inbox + recent notes */}
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h3>Recent submissions</h3>
            <span className="sub">Latest five files from students</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('inbox')} style={{ marginLeft: 'auto' }}>
              View all <Icons.ArrowRight size={14}/>
            </button>
          </div>
          <div className="panel-body flush">
            {loading ? <PageLoader variant="table" rows={4}/> : recentInbox.length === 0 ? (
              <div style={{ padding: 30 }}>
                <EmptyState title="Nothing to review yet"
                            message="When students upload slides, decks, or scans, they land here."/>
              </div>
            ) : (
              <div className="scroll-table fade-in">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>From</th>
                      <th>When</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInbox.map(up => {
                      const who = uploaderOf(up, users);
                      return (
                        <tr key={up.id} style={{ cursor: 'pointer' }} onClick={() => onNav('inbox')}>
                          <td data-l="File">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                          <td data-l="When" style={{ whiteSpace: 'nowrap' }}>{fmtRelative(up.uploadedAt)}</td>
                          <td data-l="Status"><StatusBadge status={up.status}/></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head" style={{ borderBottomColor: 'var(--border-2)' }}>
            <h3>Latest notes</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('notes')} style={{ marginLeft: 'auto' }}>
              All notes <Icons.ArrowRight size={14}/>
            </button>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading ? <PageLoader rows={3}/> : recentNotes.length === 0 ? (
              <EmptyState title="No notes yet" message="Publish your first Note from any pending submission."/>
            ) : recentNotes.map(n => (
              <div key={n.id} className="note-list-card fade-in">
                <div className="nlc-head">
                  <span className="tag tag-walnut" style={{ fontSize: 11 }}>{n.courseName}</span>
                  {n.chapterNumber && <span className="tag tag-soft" style={{ fontSize: 11 }}>Ch.{n.chapterNumber}</span>}
                  {(!n.price || Number(n.price) === 0)
                    ? <span className="tag tag-soft" style={{ fontSize: 10 }}>Free</span>
                    : <span className="tag tag-bark" style={{ fontSize: 10 }}>BD {Number(n.price).toFixed(3)}</span>}
                  <span style={{ marginLeft: 'auto', font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 11, color: 'var(--fg-3)' }}>
                    {fmtRelative(n.publishedAt)}
                  </span>
                </div>
                <div className="nlc-title">{n.title}</div>
                <div className="nlc-meta">
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
function ContentInbox({ user, onPublish, topbarSearch }) {
  const { toast } = useToast();
  const [users,   setUsers]   = useStateAd([]);
  const [uploads, setUploads] = useStateAd([]);
  const [loading, setLoading] = useStateAd(true);
  const [q, setQ] = useStateAd('');
  const [filter, setFilter] = useStateAd('all');

  useEffectAd(() => { setQ(topbarSearch || ''); }, [topbarSearch]);
  const [typeFilter, setTypeFilter] = useStateAd('all');
  const [collegeFilter, setCollegeFilter] = useStateAd('all');
  const [confirmDel, setConfirmDel]           = useStateAd(null);
  const [viewFilesUpload, setViewFilesUpload] = useStateAd(null);

  function refresh() {
    Promise.all([NotatiAPI.getUploads(), NotatiAPI.getUsers()])
      .then(([up, u]) => { setUploads(up); setUsers(u); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffectAd(() => { refresh(); }, []);

  async function handleDelete(up) {
    try {
      await NotatiAPI.deleteUpload(up.id);
      toast.success('Deleted', `"${up.title}" removed.`);
      setConfirmDel(null);
      refresh();
    } catch(e) {
      toast.error('Could not delete', e.message);
    }
  }

  const filtered = useMemoAd(() => {
    const ql = q.trim().toLowerCase();
    return uploads.filter(up => {
      if (filter !== 'all' && up.status !== filter) return false;
      if (typeFilter !== 'all' && up.fileType !== typeFilter) return false;
      if (collegeFilter !== 'all' && up.college !== collegeFilter) return false;
      if (!ql) return true;
      const who = uploaderOf(up, users);
      return [up.title, up.college, up.courseName, up.chapterTitle, up.fileName, who.name, who.email].some(s => (s || '').toLowerCase().includes(ql));
    });
  }, [uploads, q, filter, typeFilter, collegeFilter, users]);

  function handlePreview(up) {
    if (!up.fileUrl) { toast.error('No file', 'This upload has no attached file.'); return; }
    NotatiAPI.previewUploadFile(up.id)
      .catch(e => toast.error('Preview failed', e.message));
  }

  function handleDownload(up) {
    if (!up.fileUrl) { toast.error('No file', 'This upload has no attached file.'); return; }
    NotatiAPI.downloadUploadFile(up.id, up.fileName || up.title)
      .catch(e => toast.error('Download failed', e.message));
  }

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <h1>Content inbox</h1>
          <p className="sub">Every file students have submitted, oldest pending first. Open one to publish a Note back.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="filters" style={{ margin: 0 }}>
            {['all', 'pending', 'approved'].map(k => (
              <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setFilter(k)} style={{ borderRadius: 'var(--r-pill)' }}>
                {{ all: 'All', pending: 'Pending', approved: 'Approved' }[k]}
                <span style={{ opacity: .6, marginLeft: 4 }}>
                  {k === 'all' ? uploads.length : uploads.filter(u => u.status === k).length}
                </span>
              </button>
            ))}
          </div>

          <div className="filter-bar">
            <select className="filter-select" value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)}>
              <option value="all">All colleges</option>
              {COLLEGES_AD.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All types</option>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="pptx">PPTX</option>
            </select>
            <div className="search-mini" style={{ minWidth: 240 }}>
              <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filename, title, student…"/>
            </div>
          </div>
        </div>

        <div className="panel-body flush">
          {loading ? <PageLoader variant="table" rows={5}/> : filtered.length === 0 ? (
            <div style={{ padding: 30 }}>
              <EmptyState title="No submissions match these filters"
                          message="Try clearing the search or switching to All to see everything."/>
            </div>
          ) : (
            <div className="scroll-table fade-in">
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
                          <div className="name-cell" style={{ maxWidth: 300 }}>
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
                        <td data-l="Uploaded" style={{ whiteSpace: 'nowrap' }}>{fmtDate(up.uploadedAt)}</td>
                        <td data-l="Status"><StatusBadge status={up.status}/></td>
                        <td className="r" data-l="Actions">
                          <div className="row-actions">
                            {up.fileUrl ? (<>
                              <button className="btn btn-ghost btn-sm" onClick={() => handlePreview(up)} title="Preview file">
                                <Icons.Eye size={15}/>
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(up)} title="Download original">
                                <Icons.Download size={15}/>
                              </button>
                            </>) : (
                              <button className="btn btn-soft btn-sm" onClick={() => setViewFilesUpload(up)} title="View submitted files">
                                <Icons.File size={13}/> Files
                              </button>
                            )}
                            {up.status === 'pending'
                              ? <button className="btn btn-primary btn-sm" onClick={() => onPublish(up)}>
                                  Publish note <Icons.ArrowRight size={14}/>
                                </button>
                              : <button className="btn btn-soft btn-sm" onClick={() => onPublish(up)}>
                                  <Icons.Edit size={14}/> Update
                                </button>}
                            <button className="btn btn-danger btn-sm" title="Delete" onClick={() => setConfirmDel(up)}>
                              <Icons.Trash size={15}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)}
             title="Delete this submission?"
             subtitle="The file record will be removed. This cannot be undone."
             footer={<>
               <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
               <button className="btn btn-primary"
                       style={{ background: 'var(--notati-crimson)', borderColor: 'var(--notati-crimson)' }}
                       onClick={() => handleDelete(confirmDel)}>
                 <Icons.Trash size={15}/> Delete
               </button>
             </>}>
        {confirmDel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <FileTypeChip type={confirmDel.fileType}/>
            <div>
              <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)' }}>{confirmDel.title}</div>
              <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                {confirmDel.fileName} · {confirmDel.userEmail}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ViewUploadFilesModal
        open={!!viewFilesUpload}
        upload={viewFilesUpload}
        onClose={() => setViewFilesUpload(null)}/>
    </div>
  );
}

/* ============================================================
   ViewUploadFilesModal — admin views files attached to a student submission
   ============================================================ */
function ViewUploadFilesModal({ open, upload, onClose }) {
  const { toast } = useToast();
  const [files, setFiles]   = useStateAd([]);
  const [loading, setLoading] = useStateAd(false);

  useEffectAd(() => {
    if (!open || !upload) return;
    setLoading(true);
    NotatiAPI.getUploadFiles(upload.id)
      .then(f => { setFiles(f); setLoading(false); })
      .catch(e => { toast.error('Could not load files', e.message); setLoading(false); });
  }, [open, upload]);

  function download(f) {
    NotatiAPI.downloadUploadFileById(f.id, f.label || 'file')
      .catch(e => toast.error('Download failed', e.message));
  }

  if (!open || !upload) return null;
  return (
    <Modal open={open} onClose={onClose}
           title="Submitted files"
           subtitle={`${upload.title} · ${upload.userEmail}`}
           footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      {loading ? <PageLoader rows={3}/> : files.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
          No files found for this submission.
        </div>
      ) : files.map((f, i) => {
        const ext = f.file ? (String(f.file).split('.').pop() || '').toLowerCase() : '';
        return (
          <div key={f.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', marginBottom: 8, borderRadius: 'var(--r-5)',
            border: '1px solid var(--border-1)', background: 'var(--bg-section)'
          }}>
            <FileTypeChip type={ext || 'pdf'}/>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>
              {f.label || (f.file ? String(f.file).split('/').pop() : '') || `File ${i + 1}`}
            </span>
            <button className="btn btn-soft btn-sm" onClick={() => download(f)}>
              <Icons.Download size={13}/> Download
            </button>
          </div>
        );
      })}
    </Modal>
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
  const [busy, setBusy]                 = useStateAd(false);
  const [err, setErr]                   = useStateAd('');

  // Multi-file state
  const [existingFiles,  setExistingFiles]  = useStateAd([]);   // NoteFile records
  const [pendingFiles,   setPendingFiles]   = useStateAd([]);   // {tmpId, label, file}
  const [deletedFileIds, setDeletedFileIds] = useStateAd(() => new Set());
  const [pickingForIdx,  setPickingForIdx]  = useStateAd(null);
  const { useRef: useRefAd } = React;
  const fileInputRef = useRefAd();

  useEffectAd(() => {
    if (!open) return;
    setExistingFiles([]); setPendingFiles([]); setDeletedFileIds(new Set()); setErr('');
    if (existingNote) {
      setTitle(existingNote.title);
      setCollege(existingNote.college || '');
      setCourseName(existingNote.courseName || '');
      setChapterNumber(existingNote.chapterNumber || '');
      setChapterTitle(existingNote.chapterTitle || '');
      setPrice(existingNote.price != null ? Number(existingNote.price) : 0);
      setTags(existingNote.tags.join(', '));
      setDescription(existingNote.description);
      if (existingNote._numId) {
        NotatiAPI.getNoteFiles(existingNote._numId)
          .then(setExistingFiles).catch(() => {});
      }
    } else {
      setTitle(upload && upload.chapterTitle ? upload.chapterTitle : '');
      setCollege(upload ? upload.college || '' : '');
      setCourseName(upload ? upload.courseName || '' : '');
      setChapterNumber(upload ? upload.chapterNumber || '' : '');
      setChapterTitle(upload ? upload.chapterTitle || '' : '');
      setPrice(0); setTags('');
      setDescription(upload ? upload.description || '' : '');
    }
  }, [open, upload, existingNote]);

  function addPendingFile() {
    setPendingFiles(prev => [...prev, { tmpId: Date.now(), label: '', file: null }]);
  }

  function removePending(idx) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function updatePendingLabel(idx, val) {
    setPendingFiles(prev => prev.map((pf, i) => i === idx ? { ...pf, label: val } : pf));
  }

  function openFilePicker(idx) {
    setPickingForIdx(idx);
    if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
  }

  function handleFilePicked(e) {
    const f = e.target.files && e.target.files[0];
    if (!f || pickingForIdx === null) return;
    setPendingFiles(prev => prev.map((pf, i) => i === pickingForIdx ? { ...pf, file: f } : pf));
    setPickingForIdx(null);
  }

  function markDeleted(id) {
    setDeletedFileIds(prev => { const s = new Set(prev); s.add(id); return s; });
  }

  async function publish() {
    if (!college)                     { setErr('Please select a college.'); return; }
    if (!courseName.trim())           { setErr('Course name is required.'); return; }
    if (!String(chapterNumber).trim()){ setErr('Chapter number is required.'); return; }
    if (!chapterTitle.trim())         { setErr('Chapter title is required.'); return; }
    if (!description.trim())          { setErr('Description is required.'); return; }
    setBusy(true); setErr('');
    try {
      const course = await NotatiAPI.findOrCreateCourse(courseName.trim(), college);
      let savedNote;
      if (existingNote) {
        savedNote = await NotatiAPI.updateNote(existingNote._numId, {
          course: course.id, chapter_number: Number(chapterNumber),
          chapter_title: chapterTitle.trim(), description: description.trim(),
          price: Number(price),
        });
        toast.success('Note updated', `Ch.${chapterNumber} is live.`);
      } else {
        const fd = new FormData();
        fd.append('course', course.id);
        fd.append('chapter_number', chapterNumber);
        fd.append('chapter_title', chapterTitle.trim());
        fd.append('description', description.trim());
        fd.append('price', price);
        savedNote = await NotatiAPI.createNote(fd);
        if (upload && upload.id) {
          await NotatiAPI.updateUpload(upload.id, { status: 'approved', note: savedNote._numId });
        }
        if (upload && upload.userId) {
          await NotatiAPI.grantAccess(upload.userId, savedNote._numId).catch(() => {});
        }
        toast.success('Note published', `Ch.${chapterNumber} is live in the library.`);
      }
      // Delete removed files
      for (const id of deletedFileIds) {
        await NotatiAPI.deleteNoteFile(id).catch(() => {});
      }
      // Upload pending files
      const kept = existingFiles.filter(f => !deletedFileIds.has(f.id)).length;
      let order = kept;
      for (const pf of pendingFiles) {
        if (!pf.file) continue;
        await NotatiAPI.addNoteFile(savedNote._numId, pf.file, pf.label, order);
        order++;
      }
      onPublished && onPublished();
      onClose();
    } catch (e2) {
      let msg = e2.message;
      if (msg.includes('unique set') || msg.includes('chapter_number')) {
        msg = 'A note for this course and chapter number already exists. Go to Notes Manager to edit or delete it first, then try again.';
      }
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  const visibleExisting = existingFiles.filter(f => !deletedFileIds.has(f.id));
  const totalFiles = visibleExisting.length + pendingFiles.filter(pf => pf.file).length;

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
        <label>Description <span style={{ color: 'var(--notati-crimson)' }}>*</span></label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="One or two sentences — what the student gets out of these notes." required/>
      </div>

      {/* ── Files section ── */}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ font: 'var(--type-label)', letterSpacing: '.08em', textTransform: 'uppercase',
                          color: 'var(--fg-3)', margin: 0 }}>
            Files {totalFiles > 0 && <span style={{ color: 'var(--notati-walnut)', marginLeft: 4 }}>{totalFiles}</span>}
          </label>
          <button type="button" className="btn btn-soft btn-sm" onClick={addPendingFile}>
            <Icons.Plus size={13}/> Add a file
          </button>
        </div>

        {/* Existing NoteFile records */}
        {visibleExisting.map(ef => (
          <div key={ef.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', marginBottom: 6, borderRadius: 'var(--r-5)',
            border: '1px solid var(--border-1)', background: 'var(--bg-section)'
          }}>
            <FileTypeChip type="pdf"/>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>
              {ef.label || (ef.file ? String(ef.file).split('/').pop() : '') || 'File'}
            </span>
            {ef.file_url && (
              <a href={ef.file_url} target="_blank" rel="noopener noreferrer"
                 className="btn btn-ghost btn-sm" title="Preview">
                <Icons.Eye size={13}/>
              </a>
            )}
            <button type="button" className="btn btn-danger btn-sm" title="Remove"
                    onClick={() => markDeleted(ef.id)}>
              <Icons.Trash size={13}/>
            </button>
          </div>
        ))}

        {/* Pending (new) files */}
        {pendingFiles.map((pf, idx) => (
          <div key={pf.tmpId} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', marginBottom: 6, borderRadius: 'var(--r-5)',
            border: '1px solid var(--border-2)', background: 'var(--bg-card)'
          }}>
            {pf.file
              ? <FileTypeChip type={(pf.file.name.split('.').pop() || '').toLowerCase()}/>
              : <div style={{ width: 28, height: 28, borderRadius: 'var(--r-3)', flexShrink: 0,
                               background: 'var(--bg-card-2)', border: '1px dashed var(--border-1)' }}/>}
            <input
              value={pf.label}
              onChange={e => updatePendingLabel(idx, e.target.value)}
              placeholder="Label (e.g. Lecture Notes, Q&A)"
              style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border-1)',
                       borderRadius: 'var(--r-3)', font: 'var(--type-body)', fontSize: 13,
                       background: 'var(--bg-card)', color: 'var(--fg-1)' }}/>
            {pf.file ? (
              <span style={{ fontSize: 12, color: 'var(--fg-3)', whiteSpace: 'nowrap',
                             maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pf.file.name}
              </span>
            ) : (
              <button type="button" className="btn btn-soft btn-sm"
                      onClick={() => openFilePicker(idx)}>
                Pick file
              </button>
            )}
            {pf.file && (
              <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => openFilePicker(idx)} title="Replace file">
                <Icons.Edit size={12}/>
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => removePending(idx)} title="Remove">
              <Icons.Close size={13}/>
            </button>
          </div>
        ))}

        {visibleExisting.length === 0 && pendingFiles.length === 0 && (
          <div style={{ padding: '14px 16px', borderRadius: 'var(--r-5)', textAlign: 'center',
                        border: '1px dashed var(--border-1)', color: 'var(--fg-3)', fontSize: 13 }}>
            No files yet — click "Add a file" to attach PDFs.
          </div>
        )}

        {/* Hidden file input shared by all pending rows */}
        <input ref={fileInputRef} type="file"
               accept=".pdf,.pptx,.docx,application/pdf"
               onChange={handleFilePicked} style={{ display: 'none' }}/>
      </div>

      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}
    </Modal>
  );
}

/* ============================================================
   Notes Manager — list / edit / delete published notes
   ============================================================ */
function NotesManager({ user, onEdit, onAddNew, topbarSearch }) {
  const { toast } = useToast();
  const [notes, setNotes] = useStateAd([]);
  const [loading, setLoading] = useStateAd(true);
  const [q, setQ] = useStateAd('');
  const [collegeFilter, setCollegeFilter] = useStateAd('all');
  const [priceFilter, setPriceFilter] = useStateAd('all');
  const [confirmDel, setConfirmDel] = useStateAd(null);

  useEffectAd(() => { setQ(topbarSearch || ''); }, [topbarSearch]);

  function refresh() {
    NotatiAPI.getNotes()
      .then(n => { setNotes(n); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffectAd(() => { refresh(); }, []);

  const filtered = useMemoAd(() => {
    const ql = q.trim().toLowerCase();
    return notes.filter(n => {
      if (collegeFilter !== 'all' && n.college !== collegeFilter) return false;
      if (priceFilter === 'free' && (n.price && Number(n.price) > 0)) return false;
      if (priceFilter === 'paid' && (!n.price || Number(n.price) === 0)) return false;
      if (!ql) return true;
      return [n.title, n.college, n.courseName, n.chapterTitle, n.description].some(s => (s || '').toLowerCase().includes(ql));
    });
  }, [q, notes, collegeFilter, priceFilter]);

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
    const files = n.files || [];
    if (files.length === 0) { toast.info('No file', 'No PDF is attached to this note yet.'); return; }
    const f = files[0];
    if (f.id) NotatiAPI.previewNoteFileById(f.id).catch(e => toast.error('Preview failed', e.message));
    else NotatiAPI.previewNoteFile(n._numId).catch(e => toast.error('Preview failed', e.message));
  }

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
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
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <h3>{filtered.length} notes</h3>
          <div className="filter-bar">
            <select className="filter-select" value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)}>
              <option value="all">All colleges</option>
              {COLLEGES_AD.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="filter-select" value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)}>
              <option value="all">All prices</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
            <div className="search-mini" style={{ minWidth: 240 }}>
              <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, course, chapter…"/>
            </div>
          </div>
        </div>
        <div className="panel-body flush">
          {loading ? <PageLoader variant="table" rows={5}/> : filtered.length === 0 ? (
            <div style={{ padding: 30 }}>
              <EmptyState title="No notes match that search"
                          message="Try a broader term, or hit New note to publish something fresh."
                          action={<button className="btn btn-primary" onClick={onAddNew}>
                                    <Icons.Plus size={16}/> New note
                                  </button>}/>
            </div>
          ) : (
            <div className="scroll-table fade-in">
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
                        <div className="name-cell" style={{ maxWidth: 300 }}>
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
                      <td data-l="Published" style={{ whiteSpace: 'nowrap' }}>{fmtDate(n.publishedAt)}</td>
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
            </div>
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
/* ── Send email modal ────────────────────────────────────────────────────────── */
function SendEmailModal({ user, onClose }) {
  const { toast } = useToast();
  const [subject, setSubject] = useStateAd('');
  const [message, setMessage] = useStateAd('');
  const [busy,    setBusy]    = useStateAd(false);

  if (!user) return null;

  async function send(e) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    const targetUser = user;
    const s = subject.trim();
    const m = message.trim();
    onClose();
    try {
      await NotatiAPI.sendEmail(targetUser.id, s, m);
      toast.success('Email sent.', `Message delivered to ${targetUser.name}.`);
    } catch (err) {
      toast.error('Could not send', err.message);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Send email</div>
            <div className="modal-sub">To: <strong>{user.name}</strong> &middot; <span style={{ color: 'var(--fg-3)' }}>{user.email}</span></div>
          </div>
          <button className="btn-close" onClick={onClose}><Icons.Close size={18}/></button>
        </div>

        <form className="modal-body" onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label>Subject</label>
            <input autoFocus value={subject} onChange={e => setSubject(e.target.value)}
                   placeholder="e.g. Your upload has been reviewed" required/>
          </div>
          <div className="field">
            <label>Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
                      placeholder="Write your message here…" required
                      style={{ minHeight: 180, resize: 'vertical', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.7 }}/>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !subject.trim() || !message.trim()}>
              {busy ? 'Sending…' : 'Send email'}
              {!busy && <Icons.ArrowRight size={15}/>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersList({ topbarSearch }) {
  const [users,       setUsers]       = useStateAd([]);
  const [uploads,     setUploads]     = useStateAd([]);
  const [loading,     setLoading]     = useStateAd(true);
  const [q,           setQ]           = useStateAd('');
  const [role,        setRole]        = useStateAd('all');
  const [emailTarget, setEmailTarget] = useStateAd(null);

  useEffectAd(() => { setQ(topbarSearch || ''); }, [topbarSearch]);
  useEffectAd(() => {
    Promise.all([NotatiAPI.getUsers(), NotatiAPI.getUploads()])
      .then(([u, up]) => { setUsers(u); setUploads(up); setLoading(false); })
      .catch(() => setLoading(false));
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
          {loading ? <PageLoader variant="table" rows={5}/> : filtered.length === 0 ? (
            <div style={{ padding: 30 }}>
              <EmptyState title="No matches" message="Try a different name or email."/>
            </div>
          ) : (
            <div className="scroll-table fade-in">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th className="r">Uploads</th>
                    <th></th>
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
                        <td data-l="Joined" style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.joinedAt || u.created_at)}</td>
                        <td className="r" data-l="Uploads">
                          <span style={{ font: 'var(--type-body-bold)' }}>{ups}</span>
                        </td>
                        <td>
                          {u.role !== 'admin' && (
                            <button className="btn-icon" title="Send email"
                                    onClick={() => setEmailTarget(u)}>
                              <Icons.Mail size={15}/>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <SendEmailModal user={emailTarget} onClose={() => setEmailTarget(null)}/>
    </div>
  );
}

/* ============================================================
   Access Manager — admin grants / revokes access after BenefitPay payment
   ============================================================ */
function OrdersManager() {
  const { toast } = useToast();
  const [orders, setOrders]   = useStateAd([]);
  const [filter, setFilter]   = useStateAd('pending');
  const [loading, setLoading] = useStateAd(true);
  const [busyId, setBusyId]   = useStateAd(null);

  function load() {
    setLoading(true);
    NotatiAPI.getAdminOrders(filter === 'all' ? '' : filter)
      .then(o => { setOrders(o); setLoading(false); })
      .catch(e => { toast.error('Could not load orders', e.message); setLoading(false); });
  }
  useEffectAd(load, [filter]);

  async function setStatus(order, newStatus) {
    setBusyId(order.id);
    try {
      const updated = await NotatiAPI.updateOrder(order.id, { status: newStatus });
      if (newStatus === 'paid') {
        toast.success('Order marked paid', `Unlocked ${order.item_count} item${order.item_count !== 1 ? 's' : ''} for ${order.user_name}.`);
      } else if (newStatus === 'cancelled') {
        toast.info('Order cancelled', '');
      }
      // Update the card in place so the result is visible (instead of the order
      // vanishing out of the current filter).
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...updated } : o));
    } catch (e) {
      toast.error('Update failed', e.message);
    } finally {
      setBusyId(null);
    }
  }

  const FILTERS = [
    { id: 'pending',   label: 'Pending' },
    { id: 'paid',      label: 'Paid' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'all',       label: 'All' },
  ];
  const STATUS_STYLE = {
    pending:   { background: 'var(--notati-bark, #8a6d3b)', color: 'var(--notati-paper)' },
    paid:      { background: 'var(--notati-forest)',        color: 'var(--notati-paper)' },
    cancelled: { background: 'var(--bg-card-2)',            color: 'var(--fg-3)' },
  };

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <h1>Orders</h1>
          <p className="sub">
            Students place orders from their bag and pay via BenefitPay. Once you receive payment,
            mark the order paid — that unlocks every note in it for the student automatically.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.id}
                  className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-soft'}`}
                  onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader/>
      ) : orders.length === 0 ? (
        <EmptyState title="No orders here"
                    message="Orders placed by students will appear in this list."/>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(o => (
            <section key={o.id} className="panel">
              <div className="panel-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                              gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', fontWeight: 700 }}>
                      Order #{o.id} · {o.user_name}
                    </div>
                    <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>
                      {o.user_email} · {fmtDate(o.created_at)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ ...STATUS_STYLE[o.status], font: 'var(--type-label)', fontSize: 10,
                                   padding: '3px 10px', borderRadius: 'var(--r-pill)', textTransform: 'uppercase' }}>
                      {o.status}
                    </span>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--notati-walnut)', marginTop: 6 }}>
                      BD {Number(o.total).toFixed(3)}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6,
                              borderTop: '1px solid var(--border-2)', paddingTop: 12 }}>
                  {(o.items || []).map(it => (
                    <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                      <span style={{ color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.course_name} Ch.{it.chapter_number}: {it.chapter_title}
                      </span>
                      <span style={{ color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>BD {Number(it.price).toFixed(3)}</span>
                    </div>
                  ))}
                </div>

                {o.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" disabled={busyId === o.id}
                            onClick={() => setStatus(o, 'paid')}>
                      <Icons.Check size={14}/> Mark paid &amp; unlock
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={busyId === o.id}
                            onClick={() => setStatus(o, 'cancelled')}
                            style={{ color: 'var(--notati-crimson)' }}>
                      Cancel order
                    </button>
                  </div>
                )}
                {o.status === 'paid' && o.paid_at && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--notati-forest)',
                                display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icons.Check size={13}/> Paid {fmtDate(o.paid_at)}
                  </div>
                )}
                {o.status === 'cancelled' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button className="btn btn-soft btn-sm" disabled={busyId === o.id}
                            onClick={() => setStatus(o, 'paid')}>
                      <Icons.Check size={14}/> Mark paid &amp; unlock
                    </button>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [loadingNotes, setLoadingNotes] = useStateAd(true);

  useEffectAd(() => {
    Promise.all([NotatiAPI.getNotes(), NotatiAPI.getUsers()])
      .then(([n, u]) => { setNotes(n); setUsers(u); setLoadingNotes(false); })
      .catch(() => setLoadingNotes(false));
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
                     placeholder="e.g. mariam@gmail.com" type="email" required/>
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
                          padding: '14px 18px', background: 'var(--bg-section)',
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
            {loadingNotes ? <PageLoader rows={4}/> : notes.length === 0 ? (
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
                            background: isFree ? 'var(--bg-card)' : owned ? 'var(--bg-card)' : 'var(--bg-card)'
                          }}>
                            {/* Chapter bubble */}
                            <div style={{ width: 36, height: 36, borderRadius: 'var(--r-3)', flexShrink: 0,
                                          background: isFree ? 'var(--notati-sage)' : owned ? 'var(--notati-walnut)' : 'var(--bg-card-2)',
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

/* ============================================================
   Testimonials Manager (admin)
   ============================================================ */
function TestimonialsManager() {
  const { toast } = useToast();
  const [items,   setItems]   = useStateAd([]);
  const [loading, setLoading] = useStateAd(true);

  function load() {
    setLoading(true);
    NotatiAPI.getAdminTestimonials()
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffectAd(load, []);

  async function approve(item) {
    try {
      await NotatiAPI.updateTestimonial(item.id, { approved: true });
      toast.success('Approved', item.user_name);
      load();
    } catch(e) { toast.error('Failed', 'Could not approve.'); }
  }

  async function reject(item) {
    try {
      await NotatiAPI.deleteTestimonial(item.id);
      toast.success('Removed', item.user_name);
      load();
    } catch(e) { toast.error('Failed', 'Could not remove.'); }
  }

  const pending  = items.filter(i => !i.approved);
  const approved = items.filter(i => i.approved);

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <h1>Testimonials</h1>
          <p className="sub">Approve student reviews to show them on the login page.</p>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <h3>Pending approval <span className="badge badge-amber">{pending.length}</span></h3>
        </div>
        <div className="panel-body">
          {loading ? <PageLoader rows={3}/> : pending.length === 0 ? (
            <EmptyState title="All clear" message="No testimonials waiting for review."/>
          ) : pending.map(item => (
            <div key={item.id} className="testimonial-row">
              <div className="tr-body">
                <div className="tr-text">"{item.text}"</div>
                <div className="tr-meta">
                  {item.user_name}{item.course ? ` · ${item.course}` : ''}{item.user_college ? ` · ${item.user_college}` : ''}
                  <span style={{ color: 'var(--fg-3)', marginLeft: 8 }}>{item.user_email}</span>
                </div>
              </div>
              <div className="tr-acts">
                <button className="btn btn-primary btn-sm" onClick={() => approve(item)}>
                  <Icons.Check size={13}/> Approve
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => reject(item)}>
                  <Icons.Close size={13}/> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Live on site <span className="badge badge-sage">{approved.length}</span></h3>
        </div>
        <div className="panel-body">
          {loading ? <PageLoader rows={3}/> : approved.length === 0 ? (
            <EmptyState title="None approved yet" message="Approve some reviews above."/>
          ) : approved.map(item => (
            <div key={item.id} className="testimonial-row">
              <div className="tr-body">
                <div className="tr-text">"{item.text}"</div>
                <div className="tr-meta">
                  {item.user_name}{item.course ? ` · ${item.course}` : ''}{item.user_college ? ` · ${item.user_college}` : ''}
                </div>
              </div>
              <div className="tr-acts">
                <button className="btn btn-danger btn-sm" onClick={() => reject(item)}>
                  <Icons.Close size={13}/> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   Sales View — revenue breakdown by college / course / chapter
   ============================================================ */
function SalesView({ salesData, loading }) {
  const [collegeFilter,    setCollegeFilter]    = useStateAd('all');
  const [sortBy,           setSortBy]           = useStateAd('revenue');
  const [expandedColleges, setExpandedColleges] = useStateAd(() => new Set());
  const [expandedCourses,  setExpandedCourses]  = useStateAd(() => new Set());

  const colleges = useMemoAd(() => {
    if (!salesData) return [];
    return Array.from(new Set(salesData.rows.map(r => r.college))).sort();
  }, [salesData]);

  const { filteredRows, filteredRevenue, filteredSales } = useMemoAd(() => {
    if (!salesData) return { filteredRows: [], filteredRevenue: 0, filteredSales: 0 };
    const rows = collegeFilter === 'all'
      ? salesData.rows
      : salesData.rows.filter(r => r.college === collegeFilter);
    return {
      filteredRows: rows,
      filteredRevenue: rows.reduce((s, r) => s + Number(r.revenue), 0),
      filteredSales:   rows.reduce((s, r) => s + r.sales, 0),
    };
  }, [salesData, collegeFilter]);

  const grouped = useMemoAd(() => {
    const map = {};
    filteredRows.forEach(r => {
      if (!map[r.college]) map[r.college] = { revenue: 0, sales: 0, courses: {} };
      map[r.college].revenue += Number(r.revenue);
      map[r.college].sales   += r.sales;
      const cn = r.course_name;
      if (!map[r.college].courses[cn]) map[r.college].courses[cn] = { revenue: 0, sales: 0, chapters: [] };
      map[r.college].courses[cn].revenue += Number(r.revenue);
      map[r.college].courses[cn].sales   += r.sales;
      map[r.college].courses[cn].chapters.push(r);
    });
    const entries = Object.entries(map);
    entries.sort((a, b) => sortBy === 'revenue' ? b[1].revenue - a[1].revenue : b[1].sales - a[1].sales);
    return entries;
  }, [filteredRows, sortBy]);

  function toggleCollege(college) {
    setExpandedColleges(prev => {
      const next = new Set(prev);
      if (next.has(college)) next.delete(college); else next.add(college);
      return next;
    });
  }
  function toggleCourse(key) {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (loading) return <PageLoader rows={5}/>;
  if (!salesData || salesData.rows.length === 0) return (
    <EmptyState title="No sales yet"
                message="Sales appear here once students start buying paid chapters."/>
  );

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total revenue', value: `BD ${filteredRevenue.toFixed(3)}`, sub: 'from paid chapters', color: 'var(--notati-walnut)' },
          { label: 'Total sales',   value: String(filteredSales),              sub: 'access grants sold', color: 'var(--notati-amber)' },
          { label: 'Avg per sale',  value: `BD ${filteredSales > 0 ? (filteredRevenue / filteredSales).toFixed(3) : '0.000'}`,
            sub: 'average chapter price', color: 'var(--fg-1)' },
        ].map(card => (
          <div key={card.label} style={{ flex: 1, minWidth: 160, background: 'var(--bg-section)',
                        border: '1px solid var(--border-1)', borderRadius: 'var(--r-5)', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: card.color, lineHeight: 1 }}>
              {card.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 6 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter + sort bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select className="filter-select" value={collegeFilter}
                onChange={e => setCollegeFilter(e.target.value)}>
          <option value="all">All colleges</option>
          {colleges.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={sortBy}
                onChange={e => setSortBy(e.target.value)}>
          <option value="revenue">Sort by revenue</option>
          <option value="sales">Sort by sales</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-soft btn-sm"
                  onClick={() => setExpandedColleges(new Set(grouped.map(([c]) => c)))}>
            Expand all
          </button>
          <button className="btn btn-soft btn-sm"
                  onClick={() => { setExpandedColleges(new Set()); setExpandedCourses(new Set()); }}>
            Collapse all
          </button>
        </div>
      </div>

      {/* Tree table */}
      {grouped.length === 0 ? (
        <EmptyState title="No matches" message="Try a different college filter."/>
      ) : (
        <section className="panel">
          <div className="panel-body flush">
            <div className="scroll-table">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="r" style={{ width: 90 }}>Sales</th>
                    <th className="r" style={{ width: 130 }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([college, cData]) => {
                    const colExpanded = expandedColleges.has(college);
                    const courseEntries = Object.entries(cData.courses).sort((a, b) =>
                      sortBy === 'revenue' ? b[1].revenue - a[1].revenue : b[1].sales - a[1].sales
                    );
                    const rows = [
                      <tr key={`col-${college}`} onClick={() => toggleCollege(college)}
                          style={{ cursor: 'pointer', background: 'var(--bg-section)' }}>
                        <td data-l="Name">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 11, color: 'var(--fg-3)', width: 14,
                                           textAlign: 'center', flexShrink: 0, userSelect: 'none' }}>
                              {colExpanded ? '▾' : '▸'}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg-1)' }}>
                              {college}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                              · {courseEntries.length} course{courseEntries.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </td>
                        <td className="r" data-l="Sales">
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{cData.sales}</span>
                        </td>
                        <td className="r" data-l="Revenue">
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--notati-walnut)' }}>
                            BD {cData.revenue.toFixed(3)}
                          </span>
                        </td>
                      </tr>
                    ];
                    if (colExpanded) {
                      courseEntries.forEach(([course, coData]) => {
                        const courseKey = `${college}::${course}`;
                        const coExpanded = expandedCourses.has(courseKey);
                        const chapters = [...coData.chapters].sort((a, b) => a.chapter_number - b.chapter_number);
                        rows.push(
                          <tr key={`co-${courseKey}`} onClick={() => toggleCourse(courseKey)}
                              style={{ cursor: 'pointer' }}>
                            <td data-l="Name">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 24 }}>
                                <span style={{ fontSize: 11, color: 'var(--fg-3)', width: 14,
                                               textAlign: 'center', flexShrink: 0, userSelect: 'none' }}>
                                  {coExpanded ? '▾' : '▸'}
                                </span>
                                <span className="tag tag-walnut" style={{ fontSize: 12 }}>{course}</span>
                                <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                                  {chapters.length} ch.
                                </span>
                              </div>
                            </td>
                            <td className="r" data-l="Sales">
                              <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{coData.sales}</span>
                            </td>
                            <td className="r" data-l="Revenue">
                              <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>BD {coData.revenue.toFixed(3)}</span>
                            </td>
                          </tr>
                        );
                        if (coExpanded) {
                          chapters.forEach(ch => {
                            rows.push(
                              <tr key={`ch-${ch.id}`}>
                                <td data-l="Name">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 64 }}>
                                    <div style={{
                                      width: 28, height: 28, borderRadius: 'var(--r-3)', flexShrink: 0,
                                      background: 'var(--notati-walnut)', color: 'var(--notati-paper)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: 12, fontWeight: 700
                                    }}>
                                      {ch.chapter_number}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                      <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 600 }}>
                                        {ch.chapter_title}
                                      </span>
                                      <span className="tag tag-bark" style={{ marginLeft: 8, fontSize: 10 }}>
                                        BD {Number(ch.price).toFixed(3)}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="r" data-l="Sales">
                                  <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{ch.sales}</span>
                                </td>
                                <td className="r" data-l="Revenue">
                                  <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>BD {Number(ch.revenue).toFixed(3)}</span>
                                </td>
                              </tr>
                            );
                          });
                        }
                      });
                    }
                    return rows;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   Chapter Insights (admin)
   ============================================================ */
function ChapterInsights() {
  const { toast } = useToast();
  const [notes,         setNotes]         = useStateAd([]);
  const [chapterQ,      setChapterQ]      = useStateAd('');
  const [dropOpen,      setDropOpen]      = useStateAd(false);
  const [selectedNote,  setSelectedNote]  = useStateAd(null);
  const [chapterAccess, setChapterAccess] = useStateAd([]);
  const [loadingAccess, setLoadingAccess] = useStateAd(false);
  const [rankings,         setRankings]         = useStateAd([]);
  const [loadingRanks,     setLoadingRanks]     = useStateAd(true);
  const [rankPriceFilter,  setRankPriceFilter]  = useStateAd('all');
  const [rankCollegeFilter,setRankCollegeFilter]= useStateAd('all');
  const [insightsTab,  setInsightsTab]  = useStateAd('access');
  const [salesData,    setSalesData]    = useStateAd(null);
  const [loadingSales, setLoadingSales] = useStateAd(false);

  useEffectAd(() => {
    if (insightsTab !== 'sales' || salesData) return;
    setLoadingSales(true);
    NotatiAPI.getSalesData()
      .then(setSalesData).catch(() => {})
      .finally(() => setLoadingSales(false));
  }, [insightsTab]);

  useEffectAd(() => {
    NotatiAPI.getNotes().then(setNotes).catch(() => {});
    NotatiAPI.getChapterRankings()
      .then(setRankings).catch(() => {})
      .finally(() => setLoadingRanks(false));
  }, []);

  const rankingColleges = useMemoAd(() => {
    const seen = new Set();
    rankings.forEach(r => { if (r.college) seen.add(r.college); });
    return Array.from(seen).sort();
  }, [rankings]);

  const filteredRankings = useMemoAd(() => {
    return rankings.filter(r => {
      if (rankPriceFilter === 'free' && Number(r.price) !== 0) return false;
      if (rankPriceFilter === 'paid' && Number(r.price) === 0) return false;
      if (rankCollegeFilter !== 'all' && r.college !== rankCollegeFilter) return false;
      return true;
    });
  }, [rankings, rankPriceFilter, rankCollegeFilter]);

  const filteredNotes = useMemoAd(() => {
    const q = chapterQ.trim().toLowerCase();
    if (!q) return [];
    return notes.filter(n =>
      [n.courseName, n.chapterTitle, String(n.chapterNumber)].some(s =>
        (s || '').toLowerCase().includes(q)
      )
    ).slice(0, 20);
  }, [notes, chapterQ]);

  async function selectChapter(note) {
    setChapterQ('');
    setDropOpen(false);
    setSelectedNote(note);
    setChapterAccess([]);
    setLoadingAccess(true);
    try {
      const access = await NotatiAPI.getAccessListByNote(note._numId);
      setChapterAccess(access);
    } catch (e2) {
      toast.error('Could not load access list', e2.message);
    }
    setLoadingAccess(false);
  }

  const topCount = filteredRankings.length > 0 ? filteredRankings[0].access_count : 1;

  const medalColor = i => i === 0 ? 'var(--notati-amber)' : i === 1 ? '#9CA3AF' : i === 2 ? 'var(--notati-walnut)' : 'var(--fg-3)';
  const bubbleBg   = i => i === 0 ? 'var(--notati-amber)' : 'var(--notati-walnut)';

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <h1>Insights</h1>
          <p className="sub">Look up who has access to any chapter, track revenue, and see which chapters are selling best.</p>
        </div>
        <div className="actions">
          <div className="filters" style={{ margin: 0 }}>
            {[
              { id: 'access', label: 'Access & Rankings' },
              { id: 'sales',  label: 'Sales' },
            ].map(t => (
              <button key={t.id}
                      className={`btn btn-sm ${insightsTab === t.id ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setInsightsTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {insightsTab === 'access' && (<>
      {/* ── Chapter access lookup ── */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h3>Chapter access lookup</h3>
          <span style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
            Search a chapter to see every student with access
          </span>
        </div>
        <div className="panel-body">

          {/* Search */}
          <div className="search-mini" style={{ fontSize: 14 }}>
            <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
            <input
              value={chapterQ}
              onChange={e => { setChapterQ(e.target.value); setDropOpen(true); }}
              onFocus={() => setDropOpen(true)}
              placeholder="Search by course name or chapter title…"
            />
            {chapterQ && (
              <button onClick={() => { setChapterQ(''); setDropOpen(false); setSelectedNote(null); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                               color: 'var(--fg-3)', padding: '0 4px', lineHeight: 1 }}>
                <Icons.Close size={14}/>
              </button>
            )}
          </div>

          {/* Inline scrollable results — no absolute positioning to avoid panel clipping */}
          {dropOpen && filteredNotes.length > 0 && (
            <div style={{
              marginTop: 8,
              border: '1px solid var(--border-1)', borderRadius: 'var(--r-5)',
              overflow: 'hidden', maxHeight: 300, overflowY: 'auto'
            }}>
              {filteredNotes.map((n, i) => (
                <div key={n.id}
                     onClick={() => selectChapter(n)}
                     style={{
                       padding: '10px 14px', cursor: 'pointer',
                       borderBottom: i < filteredNotes.length - 1 ? '1px solid var(--border-1)' : 'none',
                       display: 'flex', alignItems: 'center', gap: 12,
                       background: 'var(--bg-card)'
                     }}
                     onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-section)'}
                     onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 'var(--r-3)', flexShrink: 0,
                    background: Number(n.price) === 0 ? 'var(--notati-sage)' : 'var(--notati-walnut)',
                    color: 'var(--notati-paper)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700
                  }}>
                    {n.chapterNumber}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg-1)',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Ch.{n.chapterNumber}: {n.chapterTitle}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{n.courseName}</div>
                  </div>
                  <span className={`tag ${Number(n.price) === 0 ? 'tag-soft' : 'tag-bark'}`} style={{ fontSize: 10, flexShrink: 0 }}>
                    {Number(n.price) === 0 ? 'Free' : `BD ${Number(n.price).toFixed(3)}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Empty hint */}
          {!selectedNote && !chapterQ && (
            <p style={{ marginTop: 14, font: 'var(--type-caption)', fontStyle: 'normal',
                        color: 'var(--fg-3)', fontSize: 13 }}>
              Start typing to search across all published chapters.
            </p>
          )}

          {/* Result */}
          {selectedNote && (
            <div style={{ marginTop: 20 }}>

              {/* Chapter banner */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 20px',
                background: 'var(--bg-section)',
                border: '1px solid var(--border-1)',
                borderLeft: '4px solid var(--notati-walnut)',
                borderRadius: 'var(--r-5)',
                marginBottom: 16
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 'var(--r-3)', flexShrink: 0,
                  background: 'var(--notati-walnut)', color: 'var(--notati-paper)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800
                }}>
                  {selectedNote.chapterNumber}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg-1)', marginBottom: 3 }}>
                    Ch.{selectedNote.chapterNumber}: {selectedNote.chapterTitle}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{selectedNote.courseName}</span>
                    <span className={`tag ${Number(selectedNote.price) === 0 ? 'tag-soft' : 'tag-bark'}`} style={{ fontSize: 10 }}>
                      {Number(selectedNote.price) === 0 ? 'Free' : `BD ${Number(selectedNote.price).toFixed(3)}`}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0,
                              background: 'var(--bg-card)', border: '1px solid var(--border-1)',
                              borderRadius: 'var(--r-5)', padding: '10px 18px' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--notati-walnut)', lineHeight: 1 }}>
                    {loadingAccess ? '…' : chapterAccess.length}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>
                    {chapterAccess.length === 1 ? 'student' : 'students'}
                  </div>
                </div>
              </div>

              {/* Student list */}
              {loadingAccess ? <PageLoader rows={3}/> : chapterAccess.length === 0 ? (
                <EmptyState title="No access grants yet"
                            message="No student has been granted access to this chapter."/>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {chapterAccess.map((a, i) => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 'var(--r-5)',
                      border: '1px solid var(--border-1)', background: 'var(--bg-card)'
                    }}>
                      <div style={{ width: 20, flexShrink: 0, textAlign: 'center',
                                    fontSize: 11, color: 'var(--fg-3)', fontWeight: 600 }}>
                        {i + 1}
                      </div>
                      <span className="avatar-sm" style={{ width: 34, height: 34, fontSize: 15, flexShrink: 0 }}>
                        {(a.user_name || '?').charAt(0)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg-1)' }}>
                          {a.user_name || '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{a.user_email}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <Icons.Check size={13} style={{ color: 'var(--notati-sage)' }}/>
                        <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                          {fmtDate(a.granted_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Chapter rankings ── */}
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head">
          <h3>Most accessed chapters</h3>
          <span style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
            Ranked by total access grants
          </span>
        </div>
        <div className="panel-body">

          {/* Filter bar */}
          {!loadingRanks && rankings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {/* Price filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--fg-3)', fontWeight: 600, minWidth: 48 }}>Price</span>
                <div className="filters" style={{ margin: 0 }}>
                  {[
                    { id: 'all',  label: 'All' },
                    { id: 'paid', label: 'Paid' },
                    { id: 'free', label: 'Free' },
                  ].map(o => (
                    <button key={o.id}
                            className={`btn btn-sm ${rankPriceFilter === o.id ? 'btn-primary' : 'btn-soft'}`}
                            onClick={() => setRankPriceFilter(o.id)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* College filter */}
              {rankingColleges.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--fg-3)', fontWeight: 600, minWidth: 48 }}>College</span>
                  <div className="filters" style={{ margin: 0, flexWrap: 'wrap' }}>
                    <button className={`btn btn-sm ${rankCollegeFilter === 'all' ? 'btn-primary' : 'btn-soft'}`}
                            onClick={() => setRankCollegeFilter('all')}>
                      All
                    </button>
                    {rankingColleges.map(c => (
                      <button key={c}
                              className={`btn btn-sm ${rankCollegeFilter === c ? 'btn-primary' : 'btn-soft'}`}
                              onClick={() => setRankCollegeFilter(c)}
                              style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {loadingRanks ? <PageLoader rows={5}/> : rankings.length === 0 ? (
            <EmptyState title="No sales data yet"
                        message="Rankings will appear here once students start unlocking paid chapters."/>
          ) : filteredRankings.length === 0 ? (
            <EmptyState title="No matches"
                        message="No chapters match the selected filters."/>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredRankings.map((r, idx) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: idx < 3 ? '14px 16px' : '11px 16px',
                  borderRadius: 'var(--r-5)',
                  border: `1px solid ${idx === 0 ? 'var(--notati-amber)' : 'var(--border-1)'}`,
                  background: idx === 0 ? 'color-mix(in srgb, var(--notati-amber) 8%, var(--bg-card))' : 'var(--bg-card)',
                }}>

                  {/* Rank badge */}
                  <div style={{
                    width: 32, flexShrink: 0, textAlign: 'center',
                    fontSize: idx < 3 ? 16 : 13, fontWeight: 800,
                    color: medalColor(idx)
                  }}>
                    #{idx + 1}
                  </div>

                  {/* Chapter bubble */}
                  <div style={{
                    width: idx < 3 ? 42 : 36, height: idx < 3 ? 42 : 36,
                    borderRadius: 'var(--r-3)', flexShrink: 0,
                    background: bubbleBg(idx), color: 'var(--notati-paper)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: idx < 3 ? 15 : 13, fontWeight: 700
                  }}>
                    {r.chapter_number}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: idx < 3 ? 700 : 600,
                      fontSize: idx < 3 ? 14 : 13,
                      color: 'var(--fg-1)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      Ch.{r.chapter_number}: {r.chapter_title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>
                      {r.course_name}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ width: 120, flexShrink: 0 }}>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--border-2)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        background: idx === 0 ? 'var(--notati-amber)' : 'var(--notati-walnut)',
                        width: `${Math.max(6, Math.round(100 * r.access_count / topCount))}%`,
                        transition: 'width .4s ease-out'
                      }}/>
                    </div>
                  </div>

                  {/* Sales count */}
                  <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 56 }}>
                    <span style={{
                      fontWeight: 800,
                      fontSize: idx < 3 ? 18 : 15,
                      color: idx === 0 ? 'var(--notati-amber)' : 'var(--fg-1)'
                    }}>
                      {r.access_count}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 1 }}>
                      {r.access_count === 1 ? 'sale' : 'sales'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      </>)}

      {insightsTab === 'sales' && (
        <SalesView salesData={salesData} loading={loadingSales}/>
      )}
    </div>
  );
}

Object.assign(window, { AdminDashboard, ContentInbox, UploadNoteModal, NotesManager, UsersList, OrdersManager, AccessManager, TestimonialsManager, ChapterInsights });
