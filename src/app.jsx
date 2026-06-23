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
  { id: 'overview',     label: 'Overview',      icon: 'Dashboard' },
  { id: 'inbox',        label: 'Content inbox', icon: 'Inbox' },
  { id: 'notes',        label: 'Notes manager', icon: 'Notes' },
  { id: 'users',        label: 'Users',         icon: 'Users' },
  { id: 'orders',       label: 'Orders',        icon: 'Bag'      },
  { id: 'discounts',    label: 'Discounts',     icon: 'Tag'      },
  { id: 'access',       label: 'Unlock access', icon: 'Lock'     },
  { id: 'insights',    label: 'Insights',      icon: 'BarChart' },
  { id: 'testimonials', label: 'Testimonials',  icon: 'Star'    },
];

const CUSTOMER_NAV = [
  { id: 'overview', label: 'Dashboard',     icon: 'Dashboard' },
  { id: 'library',  label: 'Notes library', icon: 'Library' },
  { id: 'mynotes',  label: 'My notes',      icon: 'BookOpen' },
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
function DashboardShell({ user, role, page, onNav, onLogout, darkMode, onThemeToggle }) {
  const [sideOpen, setSideOpen]   = useStateApp(false);
  const [collapsed, setCollapsed] = useStateApp(false);
  const [search, setSearch]       = useStateApp('');
  const [publishUpload, setPublishUpload] = useStateApp(null);
  const [editingNote, setEditingNote]     = useStateApp(null);
  const [readingNote, setReadingNote]     = useStateApp(null);
  const [detailsNote, setDetailsNote]     = useStateApp(null);
  const [refreshKey, setRefreshKey]       = useStateApp(0);
  const [bagItems, setBagItems]           = useStateApp(() => NotatiStore.getBag());
  const [bagOpen, setBagOpen]             = useStateApp(false);

  const isAdmin = role === 'admin';
  const nav     = isAdmin ? ADMIN_NAV : CUSTOMER_NAV;
  const current = page || 'overview';

  // Sync bag from server on mount (covers both fresh login and already-logged-in page loads)
  useEffectApp(() => {
    if (!isAdmin) {
      NotatiStore.syncBagFromServer().then(merged => setBagItems(merged)).catch(() => {});
    }
  }, []);

  useEffectApp(() => { setSideOpen(false); }, [page]);

  const navMap = nav.filter(n => !n.section);
  const currentLabel = (navMap.find(n => n.id === current) || navMap[0]).label;

  const searchablePages = isAdmin ? ['inbox', 'notes', 'users'] : null;
  const searchActive = isAdmin ? searchablePages.includes(current) : true;

  function bump() { setRefreshKey(k => k + 1); }
  function navWithClear(id) { setSearch(''); onNav(id); }

  function handleSearch(val) {
    setSearch(val);
    if (!isAdmin && val && current !== 'library') onNav('library');
  }

  async function handlePublishFromInbox(upload) {
    let linkedNote = null;
    if (upload && upload.noteId) {
      try { linkedNote = await NotatiAPI.getNote(Number(upload.noteId)); } catch(e) {}
    }
    setPublishUpload(upload);
    setEditingNote(linkedNote);
  }

  function handleAddToBag(note) {
    setBagItems([...NotatiStore.addToBag(note)]);
  }
  function handleRemoveFromBag(noteId) {
    setBagItems([...NotatiStore.removeFromBag(noteId)]);
  }
  function handleClearBag() {
    setBagItems(NotatiStore.clearBag());
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
               onNav={navWithClear}
               user={user}
               onLogout={onLogout}
               isOpen={sideOpen}
               onClose={() => setSideOpen(false)}
               collapsed={collapsed}
               darkMode={darkMode}
               onThemeToggle={onThemeToggle}/>

      <div className="main">
        <Topbar
          crumb={isAdmin ? 'Admin' : 'Student'}
          current={currentLabel}
          role={isAdmin ? 'Admin' : 'Student'}
          onMenu={() => {
            if (window.matchMedia('(max-width: 720px)').matches) setSideOpen(o => !o);
            else setCollapsed(c => !c);
          }}
          search={searchActive ? search : undefined}
          onSearch={handleSearch}
          searchPlaceholder={isAdmin ? 'Search notes, uploads, users…' : 'Search notes…'}
          bagCount={!isAdmin ? bagItems.length : 0}
          onOpenBag={!isAdmin ? () => setBagOpen(true) : undefined}/>

        <div className="page">
          {/* ----- ADMIN PAGES ----- */}
          {isAdmin && current === 'overview' && (
            <AdminDashboard user={user} onNav={navWithClear}/>
          )}
          {isAdmin && current === 'inbox' && (
            <ContentInbox user={user} onPublish={handlePublishFromInbox} topbarSearch={search}/>
          )}
          {isAdmin && current === 'notes' && (
            <NotesManager key={refreshKey} user={user}
                          onEdit={(n) => { setEditingNote(n); setPublishUpload(null); }}
                          onAddNew={() => { setEditingNote(null); setPublishUpload({ id: null }); }}
                          topbarSearch={search}/>
          )}
          {isAdmin && current === 'users' && <UsersList topbarSearch={search}/>}
          {isAdmin && current === 'orders' && <OrdersManager/>}
          {isAdmin && current === 'discounts' && <DiscountsManager/>}
          {isAdmin && current === 'access' && <AccessManager/>}
          {isAdmin && current === 'insights' && <ChapterInsights/>}
          {isAdmin && current === 'testimonials' && <TestimonialsManager/>}

          {/* ----- CUSTOMER PAGES ----- */}
          {!isAdmin && current === 'overview' && (
            <CustomerDashboard user={user} onNav={navWithClear} onOpenNote={setReadingNote} onShowDetails={setDetailsNote}
                               bag={bagItems} onAddToBag={handleAddToBag} onRemoveFromBag={handleRemoveFromBag}/>
          )}
          {!isAdmin && current === 'upload' && (
            <UploadContent user={user} onDone={() => navWithClear('uploads')}/>
          )}
          {!isAdmin && current === 'uploads' && (
            <MyUploads user={user} onNav={navWithClear} onOpenNote={setReadingNote}/>
          )}
          {!isAdmin && current === 'library' && (
            <NotesLibrary user={user} onOpenNote={setReadingNote} onShowDetails={setDetailsNote}
                          bag={bagItems} onAddToBag={handleAddToBag} onRemoveFromBag={handleRemoveFromBag}
                          topbarSearch={search}/>
          )}
          {!isAdmin && current === 'mynotes' && (
            <MyNotesPage user={user} onOpenNote={setReadingNote}/>
          )}
        </div>
      </div>

      {/* ----- ADMIN: publish/edit note modal ----- */}
      <UploadNoteModal
        open={!!publishUpload || (!!editingNote && !publishUpload)}
        upload={publishUpload && publishUpload.id ? publishUpload : null}
        existingNote={editingNote}
        user={user}
        onClose={() => { setPublishUpload(null); setEditingNote(null); }}
        onPublished={() => { bump(); }}/>

      {/* ----- CUSTOMER: read note ----- */}
      <NoteReader open={!!readingNote} note={readingNote} onClose={() => setReadingNote(null)}/>

      {/* ----- CUSTOMER: locked-note details (description + file count) ----- */}
      {!isAdmin && (
        <NoteDetailsModal
          open={!!detailsNote}
          note={detailsNote}
          bag={bagItems}
          onAddToBag={handleAddToBag}
          onRemoveFromBag={handleRemoveFromBag}
          onClose={() => setDetailsNote(null)}/>
      )}

      {/* ----- CUSTOMER: bag drawer ----- */}
      {!isAdmin && (
        <BagDrawer
          open={bagOpen}
          items={bagItems}
          user={user}
          onClose={() => setBagOpen(false)}
          onRemove={handleRemoveFromBag}
          onClear={handleClearBag}/>
      )}
    </div>
  );
}

/* ============================================================
   App root
   ============================================================ */
function App() {
  const [user, setUser]      = useStateApp(NotatiStore.getSession());
  const [mode, setMode]      = useStateApp('landing'); // when logged out: landing | login | signup
  const [route, setRoute]    = useStateApp(parseHash());
  const [darkMode, setDarkMode] = useStateApp(() => localStorage.getItem('notati-theme') === 'dark');

  useEffectApp(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('notati-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  function toggleTheme() { setDarkMode(d => !d); }

  // Wake backend on first load (Render free tier sleeps after inactivity)
  useEffectApp(() => { NotatiAPI.warmup(); }, []);

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
    setMode('landing');
    window.location.hash = '';
  }, []);

  const handleNav = useCallbackApp((page) => {
    if (!user) return;
    setHash(user.role, page);
  }, [user]);

  if (!user) {
    if (mode === 'signup') return <SignupView onAuth={handleAuth} switchTo={setMode} onGuest={() => setMode('landing')} darkMode={darkMode} onThemeToggle={toggleTheme}/>;
    if (mode === 'forgot') return <ForgotPasswordView onAuth={handleAuth} switchTo={setMode} onGuest={() => setMode('landing')} darkMode={darkMode} onThemeToggle={toggleTheme}/>;
    if (mode === 'login')  return <LoginView  onAuth={handleAuth} switchTo={setMode} onGuest={() => setMode('landing')} darkMode={darkMode} onThemeToggle={toggleTheme}/>;
    return <LandingPage onLogin={() => setMode('login')} onSignup={() => setMode('signup')} darkMode={darkMode} onThemeToggle={toggleTheme}/>;
  }

  return (
    <DashboardShell
      user={user}
      role={user.role}
      page={route.page || 'overview'}
      onNav={handleNav}
      onLogout={handleLogout}
      darkMode={darkMode}
      onThemeToggle={toggleTheme}/>
  );
}

/* ---------- Boot ---------- */
const rootEl = document.getElementById('root');
ReactDOM.createRoot(rootEl).render(
  <ErrorBoundary>
    <ToastProvider>
      <App/>
    </ToastProvider>
  </ErrorBoundary>
);
