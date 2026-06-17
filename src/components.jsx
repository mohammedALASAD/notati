/* ============================================================
   Notati Prototype — Shared UI Components
   Icons (inline SVG from Lucide-style strokes), Sidebar, Topbar,
   Modal, Toast host, EmptyState, FileTypeChip, StatusBadge.

   NOTE: every component is attached to `window` at the bottom
   so other JSX files (auth.jsx, admin.jsx, customer.jsx, app.jsx)
   can use them via global scope. (Babel scripts don't share modules.)
   ============================================================ */

const { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;

/* ---------- Lucide-style stroke icons (1.75 stroke, 24 box) ----------
   Pass `size` and any standard svg props. Stroke = currentColor. */
function I({ size = 18, children, ...rest }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
         viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  );
}
const Icons = {
  Dashboard: (p) => <I {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></I>,
  Inbox:     (p) => <I {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></I>,
  Upload:    (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></I>,
  Notes:     (p) => <I {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></I>,
  Library:   (p) => <I {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></I>,
  Users:     (p) => <I {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></I>,
  Folder:    (p) => <I {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></I>,
  Logout:    (p) => <I {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></I>,
  Search:    (p) => <I {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></I>,
  Menu:      (p) => <I {...p}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></I>,
  Close:     (p) => <I {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></I>,
  Plus:      (p) => <I {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></I>,
  Download:  (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></I>,
  Check:     (p) => <I {...p}><polyline points="20 6 9 17 4 12"/></I>,
  Clock:     (p) => <I {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></I>,
  Eye:       (p) => <I {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></I>,
  Edit:      (p) => <I {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></I>,
  Trash:     (p) => <I {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></I>,
  Filter:    (p) => <I {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></I>,
  ArrowRight:(p) => <I {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></I>,
  ArrowLeft: (p) => <I {...p}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></I>,
  Star:      (p) => <I {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></I>,
  Sparkle:   (p) => <I {...p}><path d="M12 3l1.5 5L18 9.5 13.5 11 12 16l-1.5-5L6 9.5 10.5 8 12 3z"/><path d="M19 17l.6 1.8L21.4 19l-1.8.6L19 21.4 18.4 19.6 16.6 19l1.8-.6L19 17z"/></I>,
  Mail:      (p) => <I {...p}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></I>,
  Lock:      (p) => <I {...p}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></I>,
  User:      (p) => <I {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></I>,
  File:      (p) => <I {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></I>,
  Tag:       (p) => <I {...p}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></I>,
  Calendar:  (p) => <I {...p}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></I>,
  Bag:       (p) => <I {...p}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></I>,
  Minus:     (p) => <I {...p}><line x1="5" y1="12" x2="19" y2="12"/></I>,
  BookOpen:  (p) => <I {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></I>,
  ArrowLeft: (p) => <I {...p}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></I>,
  Moon:      (p) => <I {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></I>,
  Sun:       (p) => <I {...p}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></I>,
};

/* ============================================================
   Toast system — provider + hook
   Usage:
     const { toast } = useToast();
     toast.success('Saved!', 'Your changes are live.');
     toast.error('Could not sign in', err.message);
   ============================================================ */
const ToastContext = createContext({ toast: { info(){}, success(){}, error(){} } });

function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((kind, title, msg) => {
    const id = ++idRef.current;
    setItems(prev => [...prev, { id, kind, title, msg }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4200);
  }, []);

  const toast = useMemo(() => ({
    info:    (t, m) => push('info', t, m),
    success: (t, m) => push('success', t, m),
    error:   (t, m) => push('error', t, m)
  }), [push]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toasts">
        {items.map(t => (
          <div key={t.id} className={`toast ${t.kind}`} role="status">
            <span className="ic">
              {t.kind === 'success' && <Icons.Check size={16}/>}
              {t.kind === 'error'   && <Icons.Close size={16}/>}
              {t.kind === 'info'    && <Icons.Sparkle size={16}/>}
            </span>
            <div className="body">
              <div className="ttl">{t.title}</div>
              {t.msg ? <div className="msg">{t.msg}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
function useToast() { return useContext(ToastContext); }

/* ============================================================
   Modal — light overlay
   ============================================================ */
function Modal({ open, onClose, title, subtitle, children, footer, size }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal ${size === 'lg' ? 'lg' : ''}`} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="ttl">
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            <Icons.Close size={18}/>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ============================================================
   Empty state — stacked-paper motif + helpful copy
   ============================================================ */
function EmptyState({ title, message, action }) {
  return (
    <div className="empty">
      <div className="stack" aria-hidden="true">
        <div className="sheet s1"></div>
        <div className="sheet s2"></div>
        <div className="sheet s3"></div>
      </div>
      <h4>{title}</h4>
      <p>{message}</p>
      {action}
    </div>
  );
}

/* ============================================================
   File-type chip — .pdf / .docx / .pptx
   ============================================================ */
function FileTypeChip({ type }) {
  const t = (type || '').toLowerCase();
  const label = { pdf: 'PDF', docx: 'DOCX', pptx: 'PPTX' }[t] || (t || 'FILE').toUpperCase();
  return (
    <span className={`ftype ftype-${t}`}>
      <span className="badge">{label}</span>
    </span>
  );
}

/* ============================================================
   Status badge — pending / reviewed / ready
   ============================================================ */
function StatusBadge({ status }) {
  const map = {
    pending:  { cls: 'status-pending',  text: 'Pending' },
    reviewed: { cls: 'status-reviewed', text: 'Reviewed' },
    ready:    { cls: 'status-ready',    text: 'Note ready' }
  };
  const x = map[status] || { cls: 'status-pending', text: status };
  return <span className={`status ${x.cls}`}>{x.text}</span>;
}

/* ============================================================
   Avatar — first initial in a Walnut circle
   ============================================================ */
function Avatar({ name, size = 'md' }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const cls = size === 'sm' ? 'avatar-sm' : 'side-user';
  if (size === 'sm') return <span className="avatar-sm">{initial}</span>;
  return <span className="av">{initial}</span>;
}

/* ============================================================
   Sidebar
   props: nav, current, onNav, user, onLogout, collapsed, isOpen, onClose
   ============================================================ */
function Sidebar({ nav, current, onNav, user, onLogout, collapsed, isOpen, onClose, darkMode, onThemeToggle }) {
  return (
    <>
      {isOpen ? <div className="side-backdrop" onClick={onClose}/> : null}
      <aside className="side" aria-label="Primary">
        <a className="side-logo" href="#" onClick={(e) => { e.preventDefault(); onNav(nav[0].id); }}>
          <img src="ds/assets/notati-mark-on-dark.svg" alt="Notati"/>
          <span className="name">Notati</span>
        </a>
        <nav className="side-nav" aria-label="Sections">
          {nav.map(item => {
            if (item.section) return <div key={item.section} className="side-section">{item.section}</div>;
            const Ic = Icons[item.icon] || Icons.Folder;
            return (
              <button key={item.id}
                      className={`side-link ${current === item.id ? 'active' : ''}`}
                      onClick={() => onNav(item.id)}>
                <Ic size={18}/>
                <span className="lbl">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="side-footer">
          <button className="side-link" onClick={onThemeToggle}
                  title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                  style={{ marginBottom: 4 }}>
            {darkMode ? <Icons.Sun size={18}/> : <Icons.Moon size={18}/>}
            <span className="lbl">{darkMode ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <div className="side-user">
            <span className="av">{(user.name || '?').trim().charAt(0).toUpperCase()}</span>
            <div className="meta">
              <div className="nm">{user.name}</div>
              <div className="em">{user.email}</div>
            </div>
          </div>
          <button className="side-link" onClick={onLogout} style={{ marginTop: 6 }}>
            <Icons.Logout size={18}/>
            <span className="lbl">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

/* ============================================================
   Topbar — breadcrumb + role tag + (optional) search
   ============================================================ */
function Topbar({ crumb, current, role, onMenu, search, onSearch, searchPlaceholder, bagCount, onOpenBag }) {
  return (
    <div className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label="Toggle menu">
        <Icons.Menu size={20}/>
      </button>
      <div className="crumb">
        {crumb} <span style={{ opacity: .35, margin: '0 6px' }}>/</span> <b>{current}</b>
      </div>
      {search !== undefined ? (
        <div className="search-mini">
          <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
          <input value={search}
                 onChange={(e) => onSearch && onSearch(e.target.value)}
                 placeholder={searchPlaceholder || 'Search…'}/>
        </div>
      ) : null}
      {role === 'Student' && onOpenBag && (
        <button className="bag-btn" onClick={onOpenBag} aria-label="Open bag">
          <Icons.Bag size={20}/>
          {bagCount > 0 && <span className="bag-badge">{bagCount}</span>}
        </button>
      )}
      <span className="role-tag">{role}</span>
    </div>
  );
}

/* ============================================================
   Stat card
   ============================================================ */
function Stat({ label, num, delta, icon, tone, hero, onClick, navLabel }) {
  const Ic = Icons[icon] || Icons.Folder;
  return (
    <div className={`stat ${tone ? 'stat-' + tone : ''} ${hero ? 'stat-hero' : ''} ${onClick ? 'stat-clickable' : ''}`}
         onClick={onClick}>
      <span className="ic"><Ic size={18}/></span>
      <div className="lbl">{label}</div>
      <div className="num">{num}</div>
      {delta ? <div className={`delta ${delta.dir || ''}`}>{delta.text}</div> : null}
      {onClick && (
        <div className="stat-nav">
          {navLabel || 'View all'} <Icons.ArrowRight size={11}/>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Time helpers
   ============================================================ */
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return fmtDate(iso);
}
function fmtSize(kb) {
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return Math.round(kb) + ' KB';
}

/* ============================================================
   Export to window so other Babel scripts can use these
   ============================================================ */
Object.assign(window, {
  Icons, I,
  ToastProvider, useToast, ToastContext,
  Modal, EmptyState, FileTypeChip, StatusBadge, Avatar,
  Sidebar, Topbar, Stat,
  fmtDate, fmtRelative, fmtSize
});
