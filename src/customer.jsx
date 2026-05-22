/* ============================================================
   Notati Prototype — Customer (student) views
   - CustomerDashboard:   overview of my uploads + notes available
   - UploadContent:       drag/drop or pick file + title + description
   - MyUploads:           list of student's submissions w/ status
   - NotesLibrary:        browsable, searchable Notes (read/download)
   - NoteReader:          simulated in-app PDF reader
   ============================================================ */

const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC, useRef: useRefC } = React;

/* ============================================================
   Customer Dashboard
   ============================================================ */
function CustomerDashboard({ user, onNav, onOpenNote }) {
  const uploads = NotatiStore.getUploadsByUser(user.id);
  const notes = NotatiStore.getNotes();

  const ready    = uploads.filter(u => u.status === 'reviewed').length;
  const pending  = uploads.filter(u => u.status === 'pending').length;

  const recentUploads = uploads.slice(0, 4);
  const featured = notes.slice(0, 3);

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">01 · Dashboard</span>
          <h1>Hey {user.name.split(' ')[0]} — ready to study?</h1>
          <p className="sub">
            Pick up where you left off. Your uploads sit at the top, the library is one tap away.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => onNav('uploads')}>
            My uploads <Icons.Folder size={16}/>
          </button>
          <button className="btn btn-primary" onClick={() => onNav('upload')}>
            <Icons.Upload size={16}/> Upload content
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat hero label="Available notes"
              num={notes.length}
              delta={{ dir: 'up', text: 'Updated this week — keep reading' }}
              icon="Library"/>
        <Stat tone="walnut" label="My uploads" num={uploads.length}
              delta={{ text: `${ready} ready · ${pending} pending` }}
              icon="Upload"/>
        <Stat tone="amber" label="Awaiting review" num={pending}
              delta={pending > 0
                ? { text: 'Admin team usually replies within 48h' }
                : { dir: 'up', text: 'Nothing pending — nice and tidy' }}
              icon="Clock"/>
        <Stat tone="sage" label="Notes ready for you" num={ready}
              delta={{ dir: 'up', text: 'From files you submitted' }}
              icon="Check"/>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h3>Your recent uploads</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('uploads')}>
              View all <Icons.ArrowRight size={14}/>
            </button>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentUploads.length === 0 ? (
              <EmptyState title="No uploads yet"
                          message="Drop a .pptx, .docx or .pdf and we'll turn it into a clean Note."
                          action={<button className="btn btn-primary" onClick={() => onNav('upload')}>
                                    <Icons.Upload size={16}/> Upload your first file
                                  </button>}/>
            ) : recentUploads.map(up => (
              <div key={up.id} className="filerow">
                <FileTypeChip type={up.fileType}/>
                <div className="body">
                  <div className="ttl">{up.title}</div>
                  <div className="meta">{up.fileName} · {fmtRelative(up.uploadedAt)} · {fmtSize(up.sizeKB)}</div>
                </div>
                <div className="acts">
                  {up.status === 'reviewed' ? (
                    <button className="btn btn-soft btn-sm"
                            onClick={() => up.noteId && onOpenNote(NotatiStore.getNoteById(up.noteId))}>
                      Read note <Icons.ArrowRight size={14}/>
                    </button>
                  ) : <StatusBadge status="pending"/>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" style={{ background: 'var(--notati-cream)' }}>
          <div className="panel-head" style={{ borderBottomColor: 'var(--border-2)' }}>
            <h3>Fresh notes for you</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('library')}>
              Library <Icons.ArrowRight size={14}/>
            </button>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {featured.length === 0 ? (
              <EmptyState title="No notes published yet"
                          message="The library is empty for now — check back soon."/>
            ) : featured.map(n => (
              <div key={n.id} className="notecard" onClick={() => onOpenNote(n)}>
                <span className="course">{n.subject}</span>
                <div className="title">{n.title}</div>
                <div className="desc">{n.description}</div>
                <div className="tags">
                  {n.tags.slice(0, 2).map(t => <span key={t} className="tag tag-soft">{t}</span>)}
                </div>
                <div className="foot">
                  <span>{fmtDate(n.publishedAt)}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--notati-walnut)', fontWeight: 700 }}>
                    Read <Icons.ArrowRight size={13}/>
                  </span>
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
   Upload Content
   ============================================================ */
function UploadContent({ user, onDone }) {
  const { toast } = useToast();
  const [title, setTitle] = useStateC('');
  const [description, setDescription] = useStateC('');
  const [file, setFile] = useStateC(null);
  const [err, setErr] = useStateC('');
  const [busy, setBusy] = useStateC(false);
  const [drag, setDrag] = useStateC(false);
  const inputRef = useRefC();

  function handleFile(f) {
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'pptx', 'docx'].includes(ext)) {
      setErr('We only accept .pdf, .pptx, or .docx for now.');
      setFile(null);
      return;
    }
    setErr('');
    setFile(f);
    // pre-fill the title from the filename if empty
    if (!title) setTitle(f.name.replace(/\.(pdf|pptx|docx)$/i, '').replace(/[_-]+/g, ' '));
  }

  function onDrop(e) {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(f);
  }

  function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      // // TODO: Replace with POST /api/uploads multipart
      NotatiStore.addUpload({ userId: user.id, title, description, file });
      toast.success('Submitted for review',
        "We'll be in touch when your Note is ready — usually within 48 hours.");
      setTitle(''); setDescription(''); setFile(null);
      setTimeout(() => { setBusy(false); onDone && onDone(); }, 300);
    } catch (e2) {
      setErr(e2.message); setBusy(false);
      toast.error('Could not upload', e2.message);
    }
  }

  const ext = file ? (file.name.split('.').pop() || '').toLowerCase() : '';

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">02 · Upload</span>
          <h1>Send us something to summarise.</h1>
          <p className="sub">Drop a slide deck, a reading, or your own draft. We'll turn it into clean notes within a couple of days.</p>
        </div>
      </div>

      <form className="grid-2" onSubmit={submit}>
        <section className="panel">
          <div className="panel-head"><h3>Your file</h3></div>
          <div className="panel-body">
            <div className={`dropzone ${drag ? 'over' : ''} ${file ? 'picked' : ''}`}
                 onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                 onDragLeave={() => setDrag(false)}
                 onDrop={onDrop}
                 onClick={() => inputRef.current && inputRef.current.click()}>
              <div className="stack" aria-hidden="true">
                <div className="sheet s1"></div>
                <div className="sheet s2"></div>
                <div className="sheet s3"></div>
              </div>
              {file ? (
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <FileTypeChip type={ext}/>
                    <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)' }}>{file.name}</div>
                  </div>
                  <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                    {fmtSize(Math.max(1, Math.round(file.size / 1024)))} · Ready to submit
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
                          onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    Pick a different file
                  </button>
                </div>
              ) : (
                <>
                  <h4>Drop your file here</h4>
                  <p>Or click to browse — PowerPoint, Word, or PDF, up to 25 MB.</p>
                  <div style={{ display: 'inline-flex', gap: 8 }}>
                    <FileTypeChip type="pdf"/>
                    <FileTypeChip type="docx"/>
                    <FileTypeChip type="pptx"/>
                  </div>
                </>
              )}
              <input ref={inputRef} type="file"
                     accept=".pdf,.pptx,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                     onChange={(e) => handleFile(e.target.files[0])}/>
            </div>
            {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h3>About this submission</h3></div>
          <div className="panel-body">
            <div className="field">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                     placeholder="e.g. Organizational Behavior — Chapter 4 slides" required/>
              <div className="hint">What you'd call this if you were sending it to a friend.</div>
            </div>
            <div className="field">
              <label>Description <span style={{ opacity: .5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                        placeholder="Anything we should know — topics, exam date, weak spots…"/>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="submit" className="btn btn-primary" disabled={busy || !file}>
                {busy ? 'Submitting…' : 'Submit for review'}
                {!busy && <Icons.ArrowRight size={16}/>}
              </button>
              <button type="button" className="btn btn-ghost"
                      onClick={() => { setTitle(''); setDescription(''); setFile(null); setErr(''); }}>
                Clear
              </button>
            </div>

            <div className="demo-hint" style={{ marginTop: 22 }}>
              <strong>How this works</strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-3)' }}>
                Once submitted, an admin reviews your file and publishes a Note back to you. You'll see it appear in
                <strong style={{ color: 'var(--fg-1)' }}> My Uploads </strong> with a "Note ready" tag.
              </p>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}

/* ============================================================
   My Uploads — student's own submissions
   ============================================================ */
function MyUploads({ user, onNav, onOpenNote }) {
  const { toast } = useToast();
  const [uploads, setUploads] = useStateC(NotatiStore.getUploadsByUser(user.id));
  const [q, setQ] = useStateC('');
  const [filter, setFilter] = useStateC('all');

  useEffectC(() => {
    const f = () => setUploads(NotatiStore.getUploadsByUser(user.id));
    window.addEventListener('focus', f);
    return () => window.removeEventListener('focus', f);
  }, [user.id]);

  const filtered = useMemoC(() => {
    const ql = q.trim().toLowerCase();
    return uploads.filter(up => {
      if (filter === 'ready'   && up.status !== 'reviewed') return false;
      if (filter === 'pending' && up.status !== 'pending')  return false;
      if (!ql) return true;
      return [up.title, up.fileName].some(s => (s || '').toLowerCase().includes(ql));
    });
  }, [uploads, q, filter]);

  function openNote(up) {
    const n = NotatiStore.getNoteById(up.noteId);
    if (n) onOpenNote(n);
    else toast.info('No note attached yet', 'An admin will publish one soon.');
  }

  const counts = {
    all:     uploads.length,
    ready:   uploads.filter(u => u.status === 'reviewed').length,
    pending: uploads.filter(u => u.status === 'pending').length
  };

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">03 · My uploads</span>
          <h1>Your submissions</h1>
          <p className="sub">Everything you've sent in. When a Note is ready, you'll see a button to read it.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => onNav('upload')}>
            <Icons.Plus size={16}/> New upload
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="filters" style={{ margin: 0 }}>
            {[
              { id: 'all',     label: 'All',         c: counts.all },
              { id: 'ready',   label: 'Note ready',  c: counts.ready },
              { id: 'pending', label: 'Pending',     c: counts.pending }
            ].map(o => (
              <button key={o.id} className={`btn btn-sm ${filter === o.id ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setFilter(o.id)}>
                {o.label} <span style={{ opacity: .6, marginLeft: 4 }}>{o.c}</span>
              </button>
            ))}
          </div>
          <div className="search-mini" style={{ minWidth: 260, marginLeft: 'auto' }}>
            <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or filename…"/>
          </div>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.length === 0 ? (
            uploads.length === 0
              ? <EmptyState title="No uploads yet"
                            message="Drop a .pptx, .docx or .pdf and we'll turn it into clean notes."
                            action={<button className="btn btn-primary" onClick={() => onNav('upload')}>
                                      <Icons.Upload size={16}/> Upload your first file
                                    </button>}/>
              : <EmptyState title="No matches"
                            message="Try a different filter or a broader search term."/>
          ) : filtered.map(up => (
            <div key={up.id} className="filerow">
              <FileTypeChip type={up.fileType}/>
              <div className="body">
                <div className="ttl">{up.title}</div>
                <div className="meta">
                  {up.fileName} · {fmtSize(up.sizeKB)} · Uploaded {fmtRelative(up.uploadedAt)}
                  {up.description ? <> · <span style={{ fontStyle: 'italic' }}>"{up.description}"</span></> : null}
                </div>
              </div>
              <div className="acts">
                <StatusBadge status={up.status === 'reviewed' ? 'ready' : 'pending'}/>
                {up.status === 'reviewed'
                  ? <button className="btn btn-primary btn-sm" onClick={() => openNote(up)}>
                      Read note <Icons.ArrowRight size={14}/>
                    </button>
                  : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   Notes Library
   ============================================================ */
function NotesLibrary({ user, onOpenNote }) {
  const [notes] = useStateC(NotatiStore.getNotes());
  const [q, setQ] = useStateC('');
  const [subject, setSubject] = useStateC('all');

  const subjects = useMemoC(() => {
    const s = new Set(notes.map(n => n.subject));
    return ['all', ...Array.from(s)];
  }, [notes]);

  const filtered = useMemoC(() => {
    const ql = q.trim().toLowerCase();
    return notes.filter(n => {
      if (subject !== 'all' && n.subject !== subject) return false;
      if (!ql) return true;
      return [n.title, n.subject, n.description, ...n.tags].some(s => (s || '').toLowerCase().includes(ql));
    });
  }, [notes, q, subject]);

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">04 · Library</span>
          <h1>Notes library</h1>
          <p className="sub">Browse every published Note. Filter by subject, search by tag, open one to read.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="filters" style={{ margin: 0 }}>
            {subjects.map(s => (
              <button key={s} className={`btn btn-sm ${subject === s ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setSubject(s)}>
                {s === 'all' ? 'All subjects' : s}
              </button>
            ))}
          </div>
          <div className="search-mini" style={{ minWidth: 280, marginLeft: 'auto' }}>
            <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, tag, subject…"/>
          </div>
        </div>

        <div className="panel-body">
          {filtered.length === 0 ? (
            <EmptyState title="No notes yet"
                        message={notes.length === 0
                          ? "The library is empty for now — check back soon."
                          : "No notes match these filters. Try a broader search."}/>
          ) : (
            <div className="grid-3">
              {filtered.map(n => (
                <div key={n.id} className="notecard" onClick={() => onOpenNote(n)}>
                  <span className="course">{n.subject}</span>
                  <div className="title">{n.title}</div>
                  <div className="desc">{n.description}</div>
                  <div className="tags">
                    {n.tags.slice(0, 3).map(t => <span key={t} className="tag tag-soft">{t}</span>)}
                  </div>
                  <div className="foot">
                    <span>{fmtDate(n.publishedAt)} · {fmtSize(n.sizeKB)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--notati-walnut)', fontWeight: 700 }}>
                      Read <Icons.ArrowRight size={13}/>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   NoteReader — simulated in-app PDF viewer
   ============================================================ */
function NoteReader({ note, open, onClose }) {
  const { toast } = useToast();
  const [page, setPage] = useStateC(1);
  const totalPages = 4;

  useEffectC(() => { if (open) setPage(1); }, [open, note]);
  if (!open || !note) return null;

  function download() {
    // // TODO: Replace with GET /api/notes/:id/file
    NotatiStore.fakeDownload(note.fileName);
    toast.success('Download started', note.fileName);
  }

  return (
    <Modal open={open} onClose={onClose} size="lg"
           title={note.title}
           subtitle={`${note.subject} · published ${fmtDate(note.publishedAt)} · ${fmtSize(note.sizeKB)}`}
           footer={<>
             <button className="btn btn-ghost" onClick={onClose}>Close</button>
             <button className="btn btn-primary" onClick={download}>
               <Icons.Download size={15}/> Download PDF
             </button>
           </>}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {note.tags.map(t => <span key={t} className="tag tag-soft">{t}</span>)}
      </div>
      <p style={{ font: 'var(--type-body)', color: 'var(--fg-2)', margin: '0 0 14px', lineHeight: 1.55 }}>
        {note.description}
      </p>

      {/* Simulated PDF viewer */}
      <div className="pdfview">
        <div className="toolbar">
          <span style={{ fontWeight: 700, color: 'var(--notati-paper)' }}>{note.fileName}</span>
          <span className="sep"></span>
          <div className="pgctrl">
            <button onClick={() => setPage(Math.max(1, page - 1))} aria-label="Previous page">
              <Icons.ArrowLeft size={14}/>
            </button>
            <span>Page {page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} aria-label="Next page">
              <Icons.ArrowRight size={14}/>
            </button>
          </div>
        </div>
        <div className="page">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ font: 'var(--type-label)', letterSpacing: '.08em',
                           color: 'var(--fg-3)', textTransform: 'uppercase' }}>{note.subject}</span>
            <span style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 11, color: 'var(--fg-3)' }}>
              Notati · From the student, to the student
            </span>
          </div>
          <div style={{ height: 4, width: 60, background: 'var(--notati-amber)', borderRadius: 2, marginBottom: 14 }}></div>
          <h2>{note.title}</h2>
          <div className="ph-line"></div>
          <div className="ph-line mid"></div>
          <div className="ph-line short"></div>
          <h3>What this chapter actually says</h3>
          <div className="ph-line"></div>
          <div className="ph-line mid"></div>
          <div className="ph-line"></div>
          <div className="ph-line short"></div>
          <h3>The two flavors</h3>
          <div className="ph-line"></div>
          <div className="ph-line mid"></div>
          <p style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12,
                      color: 'var(--fg-3)', marginTop: 24, textAlign: 'right' }}>
            Page {page}
          </p>
        </div>
      </div>
    </Modal>
  );
}

Object.assign(window, { CustomerDashboard, UploadContent, MyUploads, NotesLibrary, NoteReader });
