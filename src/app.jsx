/* ============================================================
   Notati Prototype — App root + router
   - Reads session from NotatiStore on boot
   - Shows auth views when logged out
   - Shows admin or customer shell + page based on role
   - Simple hash-based routing (/admin/inbox, /customer/library, etc.)
   ============================================================ */

const { useState: useStateApp, useEffect: useEffectApp, useCallback: useCallbackApp } = React;

/* ---------- Nav definitions ---------- */
const ADMIN_NAV = [
  { id: 'overview', label: 'Overview',       icon: 'Dashboard' },
  { id: 'inbox',    label: 'Content inbox',  icon: 'Inbox' },
  { id: 'notes',    label: 'Notes manager',  icon: 'Notes' },
  { id: 'users',    label: 'Users',          icon: 'Users' }
];

const CUSTOMER_NAV = [
  { id: 'overview', label: 'Dashboard',     icon: 'Dashboard' },
  { id: 'library',  label: 'Notes library', icon: 'Library' },
  { section: 'My stuff' },
  { id: 'upload',   label: 'Upload content',icon: 'Upload' },
  { id: 'uploads',  label: 'My uploads',    icon: 'Folder' }
];

/* ---------- Hash routing helpers ---------- */
function parseHash() {
  const h = (window.location.hash || '').replace(/^#\/?/, '');
  const [role, page] = h.split('/');
  return { role: role || null, page: page || null };
}
function setHash(role, page) {
  const next = `#/${role}${page ? '/' + page : ''}`;
  if (window.location.hash !== next) window.location.hash = next;
}

/* ============================================================
   Dashboard Shell (sidebar + topbar + page)
   ============================================================ */
function DashboardShell({ user, role, page, onNav, onLogout }) {
  const [sideOpen, setSideOpen]   = useStateApp(false);   // mobile drawer
  const [collapsed, setCollapsed] = useStateApp(false);   // desktop collapse
  const [search, setSearch]       = useStateApp('');
  const [publishUpload, setPublishUpload] = useStateApp(null); // {upload} | null
  const [editingNote, setEditingNote]     = useStateApp(null); // existing note | null
  const [readingNote, setReadingNote]     = useStateApp(null); // note for student viewer
  const [refreshKey, setRefreshKey]       = useStateApp(0);

  const isAdmin = role === 'admin';
  const nav     = isAdmin ? ADMIN_NAV : CUSTOMER_NAV;
  const current = page || 'overview';

  // close drawer when nav changes
  useEffectApp(() => { setSideOpen(false); }, [page]);

  // page title for crumb
  const navMap = nav.filter(n => !n.section);
  const currentLabel = (navMap.find(n => n.id === current) || navMap[0]).label;

  // Bump-refresh: when an admin publishes/edits a note, child views may need fresh data.
  function bump() { setRefreshKey(k => k + 1); }

  function handlePublishFromInbox(upload) {
    const linkedNote = upload && upload.noteId ? NotatiStore.getNoteById(upload.noteId) : null;
    setPublishUpload(upload);
    setEditingNote(linkedNote);
  }

  function shellCls() {
    let s = 'shell';
    if (collapsed) s += ' shell-collapsed';
    if (sideOpen)  s += ' shell-side-open';
    return s;
  }

  return (
    <div className={shellCls()} key={refreshKey}>
      <Sidebar nav={nav} current={current}
               onNav={(id) => onNav(id)}
               user={user}
               onLogout={onLogout}
               isOpen={sideOpen}
               onClose={() => setSideOpen(false)}
               collapsed={collapsed}/>

      <div className="main">
        <Topbar
          crumb={isAdmin ? 'Admin' : 'Student'}
          current={currentLabel}
          role={isAdmin ? 'Admin' : 'Student'}
          onMenu={() => {
            // On mobile, this opens the drawer; on desktop, toggle collapse.
            if (window.matchMedia('(max-width: 720px)').matches) setSideOpen(o => !o);
            else setCollapsed(c => !c);
          }}
          search={search}
          onSearch={setSearch}/>

        <div className="page">
          {/* ----- ADMIN PAGES ----- */}
          {isAdmin && current === 'overview' && (
            <AdminDashboard user={user} onNav={onNav}/>
          )}
          {isAdmin && current === 'inbox' && (
            <ContentInbox user={user} onPublish={handlePublishFromInbox}/>
          )}
          {isAdmin && current === 'notes' && (
            <NotesManager user={user}
                          onEdit={(n) => { setEditingNote(n); setPublishUpload(null); }}
                          onAddNew={() => { setEditingNote(null); setPublishUpload({ id: null }); /* trigger modal w/o upload */ }}/>
          )}
          {isAdmin && current === 'users' && <UsersList/>}

          {/* ----- CUSTOMER PAGES ----- */}
          {!isAdmin && current === 'overview' && (
            <CustomerDashboard user={user} onNav={onNav} onOpenNote={setReadingNote}/>
          )}
          {!isAdmin && current === 'upload' && (
            <UploadContent user={user} onDone={() => onNav('uploads')}/>
          )}
          {!isAdmin && current === 'uploads' && (
            <MyUploads user={user} onNav={onNav} onOpenNote={setReadingNote}/>
          )}
          {!isAdmin && current === 'library' && (
            <NotesLibrary user={user} onOpenNote={setReadingNote}/>
          )}
        </div>
      </div>

      {/* ----- ADMIN: publish/edit note modal (shared) ----- */}
      <UploadNoteModal
        open={!!publishUpload || (!!editingNote && !publishUpload)}
        upload={publishUpload && publishUpload.id ? publishUpload : null}
        existingNote={editingNote}
        user={user}
        onClose={() => { setPublishUpload(null); setEditingNote(null); }}
        onPublished={() => { bump(); }}/>

      {/* ----- CUSTOMER: read note ----- */}
      <NoteReader open={!!readingNote} note={readingNote} onClose={() => setReadingNote(null)}/>
    </div>
  );
}

/* ============================================================
   App root
   ============================================================ */
function App() {
  const [user, setUser]      = useStateApp(NotatiStore.getSession());
  const [mode, setMode]      = useStateApp('login'); // when logged out: login | signup
  const [route, setRoute]    = useStateApp(parseHash());

  // Sync hash → state and state → hash
  useEffectApp(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Whenever the user logs in/out, ensure route is consistent
  useEffectApp(() => {
    if (!user) return;
    const role = user.role;
    const expected = parseHash();
    if (expected.role !== role) setHash(role, 'overview');
  }, [user]);

  const handleAuth = useCallbackApp((u) => {
    setUser(u);
    setHash(u.role, 'overview');
  }, []);

  const handleLogout = useCallbackApp(() => {
    NotatiStore.clearSession();
    setUser(null);
    setMode('login');
    window.location.hash = '';
  }, []);

  const handleNav = useCallbackApp((page) => {
    if (!user) return;
    setHash(user.role, page);
  }, [user]);

  if (!user) {
    return mode === 'signup'
      ? <SignupView onAuth={handleAuth} switchTo={setMode}/>
      : <LoginView onAuth={handleAuth} switchTo={setMode}/>;
  }

  return (
    <DashboardShell
      user={user}
      role={user.role}
      page={route.page || 'overview'}
      onNav={handleNav}
      onLogout={handleLogout}/>
  );
}

/* ---------- Boot ---------- */
const rootEl = document.getElementById('root');
ReactDOM.createRoot(rootEl).render(
  <ToastProvider>
    <App/>
  </ToastProvider>
);
