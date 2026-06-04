/* ============================================================
   Notati Prototype — Customer (student) views
   - CustomerDashboard:   overview of my uploads + notes available
   - UploadContent:       drag/drop or pick file + title + description
   - MyUploads:           list of student's submissions w/ status
   - NotesLibrary:        browsable, searchable Notes (read/download)
   - NoteReader:          simulated in-app PDF reader
   ============================================================ */

const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC, useRef: useRefC } = React;

const COLLEGES = [
  'College of Arts',
  'College of Applied Studies',
  'College of Business Administration',
  'College of Engineering',
  'College of Health and Sport Sciences',
  'College of Information Technology',
  'College of Law',
  'College of Science'
];

const CONTACT = {
  benefitpay: '+973 3930 9797',
  whatsapp:   '97339309797',
  instagram:  'notes.uob'
};

/* ============================================================
   Get Access Modal — shown when a student taps a locked note
   ============================================================ */
function GetAccessModal({ open, note, onClose }) {
  const [copied, setCopied] = useStateC(false);

  useEffectC(() => { if (!open) setCopied(false); }, [open]);
  if (!open || !note) return null;

  function copyNumber() {
    navigator.clipboard.writeText(CONTACT.benefitpay).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const waMsg = encodeURIComponent(
    `Hi, I'd like to purchase "${note.title}" (${note.courseName} Ch.${note.chapterNumber}). My Notati email: `
  );

  return (
    <Modal open={open} onClose={onClose} size="md"
           title="Get access to this note"
           subtitle={`${note.courseName} · Ch.${note.chapterNumber}: ${note.chapterTitle} · BD ${Number(note.price).toFixed(3)}`}
           footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Note preview */}
        <div style={{ background: 'var(--notati-cream)', borderRadius: 'var(--r-5)',
                      padding: '12px 14px', border: '1px solid var(--border-2)' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 2 }}>{note.college}</div>
          <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', marginBottom: 4 }}>{note.title}</div>
          {note.description && (
            <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 13,
                          color: 'var(--fg-2)', lineHeight: 1.5 }}>
              {note.description}
            </div>
          )}
        </div>

        {/* Steps */}
        <div>
          <div style={{ font: 'var(--type-label)', color: 'var(--fg-3)', marginBottom: 10, letterSpacing: '.08em' }}>
            HOW TO GET ACCESS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['1', `Send BD ${Number(note.price).toFixed(3)} via BenefitPay to the number below.`],
              ['2', 'Message us on WhatsApp or Instagram with your email and a payment screenshot.'],
              ['3', "We'll unlock the note for you — usually within a few hours."]
            ].map(([num, text]) => (
              <div key={num} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--notati-walnut)',
                               color: 'var(--notati-paper)', display: 'flex', alignItems: 'center',
                               justifyContent: 'center', font: 'var(--type-label)', fontSize: 11, flexShrink: 0 }}>
                  {num}
                </span>
                <span style={{ font: 'var(--type-body)', color: 'var(--fg-1)', paddingTop: 3 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* BenefitPay */}
        <div style={{ background: 'var(--notati-paper)', border: '1px solid var(--border-1)',
                      borderRadius: 'var(--r-5)', padding: '14px 16px' }}>
          <div style={{ font: 'var(--type-label)', color: 'var(--fg-3)', marginBottom: 8, letterSpacing: '.08em' }}>
            BENEFITPAY NUMBER
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', fontSize: 20, letterSpacing: '.02em' }}>
              {CONTACT.benefitpay}
            </span>
            <button className="btn btn-soft btn-sm" onClick={copyNumber}>
              {copied ? <><Icons.Check size={13}/> Copied!</> : 'Copy number'}
            </button>
          </div>
        </div>

        {/* Contact buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={`https://wa.me/${CONTACT.whatsapp}?text=${waMsg}`}
             target="_blank" rel="noopener noreferrer"
             className="btn btn-primary"
             style={{ flex: 1, textDecoration: 'none', justifyContent: 'center',
                      display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icons.Mail size={15}/> WhatsApp us
          </a>
          <a href={`https://instagram.com/${CONTACT.instagram}`}
             target="_blank" rel="noopener noreferrer"
             className="btn btn-outline"
             style={{ flex: 1, textDecoration: 'none', justifyContent: 'center',
                      display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icons.User size={15}/> Instagram
          </a>
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   Bag Checkout Modal — shows all bag items + BenefitPay + WhatsApp
   ============================================================ */
function BagCheckoutModal({ open, items, user, onClose, onConfirm }) {
  const [copied, setCopied] = useStateC(false);
  useEffectC(() => { if (!open) setCopied(false); }, [open]);
  if (!open || !items || items.length === 0) return null;

  const total = items.reduce((s, i) => s + Number(i.price), 0);

  function copyNumber() {
    navigator.clipboard.writeText(CONTACT.benefitpay).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const itemLines = items.map(i =>
    `- ${i.courseName} Ch.${i.chapterNumber}: ${i.chapterTitle} (BD ${Number(i.price).toFixed(3)})`
  ).join('\n');
  const waMsg = encodeURIComponent(
    `Hi, I would like to purchase the following notes:\n${itemLines}\nTotal: BD ${total.toFixed(3)}\nMy Notati email: ${user.email}`
  );

  return (
    <Modal open={open} onClose={onClose} size="lg"
           title="Checkout"
           subtitle={`${items.length} item${items.length !== 1 ? 's' : ''} · Total BD ${total.toFixed(3)}`}
           footer={<>
             <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
             <button className="btn btn-primary" onClick={onConfirm}>
               <Icons.Check size={16}/> Done, I have paid
             </button>
           </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Order summary */}
        <div>
          <div style={{ font: 'var(--type-label)', color: 'var(--fg-3)', marginBottom: 10, letterSpacing: '.08em' }}>
            YOUR ORDER
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                       padding: '10px 14px', background: 'var(--notati-cream)',
                                       borderRadius: 'var(--r-5)', border: '1px solid var(--border-2)' }}>
                <div>
                  <div style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--fg-1)', fontSize: 14 }}>
                    {i.courseName} · Ch.{i.chapterNumber}: {i.chapterTitle}
                  </div>
                  <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                    {i.title}
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--notati-walnut)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                  BD {Number(i.price).toFixed(3)}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 14px', borderTop: '2px solid var(--border-1)', marginTop: 2 }}>
              <span style={{ font: 'var(--type-label)', letterSpacing: '.08em', color: 'var(--fg-2)' }}>TOTAL</span>
              <span style={{ font: 'var(--type-h3)', color: 'var(--notati-walnut)', fontSize: 22, fontWeight: 800 }}>
                BD {total.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div>
          <div style={{ font: 'var(--type-label)', color: 'var(--fg-3)', marginBottom: 10, letterSpacing: '.08em' }}>
            HOW TO COMPLETE PAYMENT
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['1', `Send BD ${total.toFixed(3)} via BenefitPay to the number below.`],
              ['2', 'Tap WhatsApp — your order list is pre-filled. Just hit send.'],
              ['3', 'We will unlock all your chapters — usually within a few hours.']
            ].map(([num, text]) => (
              <div key={num} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--notati-walnut)',
                               color: 'var(--notati-paper)', display: 'flex', alignItems: 'center',
                               justifyContent: 'center', font: 'var(--type-label)', fontSize: 11, flexShrink: 0 }}>
                  {num}
                </span>
                <span style={{ font: 'var(--type-body)', color: 'var(--fg-1)', paddingTop: 3 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* BenefitPay */}
        <div style={{ background: 'var(--notati-paper)', border: '1px solid var(--border-1)',
                      borderRadius: 'var(--r-5)', padding: '14px 16px' }}>
          <div style={{ font: 'var(--type-label)', color: 'var(--fg-3)', marginBottom: 8, letterSpacing: '.08em' }}>
            BENEFITPAY NUMBER
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', fontSize: 20, letterSpacing: '.02em' }}>
              {CONTACT.benefitpay}
            </span>
            <button className="btn btn-soft btn-sm" onClick={copyNumber}>
              {copied ? <><Icons.Check size={13}/> Copied!</> : 'Copy number'}
            </button>
          </div>
        </div>

        {/* Contact buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={`https://wa.me/${CONTACT.whatsapp}?text=${waMsg}`}
             target="_blank" rel="noopener noreferrer"
             className="btn btn-primary"
             style={{ flex: 1, textDecoration: 'none', justifyContent: 'center',
                      display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icons.Mail size={15}/> WhatsApp us
          </a>
          <a href={`https://instagram.com/${CONTACT.instagram}`}
             target="_blank" rel="noopener noreferrer"
             className="btn btn-outline"
             style={{ flex: 1, textDecoration: 'none', justifyContent: 'center',
                      display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icons.User size={15}/> Instagram
          </a>
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   Bag Drawer — slide-in panel with items, total, and checkout
   ============================================================ */
function BagDrawer({ open, items, user, onClose, onRemove, onClear }) {
  const { toast } = useToast();
  const [checkoutOpen, setCheckoutOpen] = useStateC(false);

  useEffectC(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const total = items.reduce((s, i) => s + Number(i.price), 0);

  function handleConfirm() {
    onClear();
    setCheckoutOpen(false);
    onClose();
    toast.success('Payment sent', 'Your bag has been cleared. Your notes will be unlocked soon.');
  }

  return (
    <>
      {open && <div className="bag-backdrop" onClick={onClose}/>}
      <div className={`bag-drawer ${open ? 'open' : ''}`} role="dialog" aria-label="Shopping bag">

        <div className="bag-head">
          <div>
            <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', fontWeight: 700 }}>My bag</div>
            <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>
              {items.length === 0 ? 'Empty' : `${items.length} item${items.length !== 1 ? 's' : ''} · BD ${total.toFixed(3)}`}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close bag">
            <Icons.Close size={18}/>
          </button>
        </div>

        <div className="bag-body">
          {items.length === 0 ? (
            <div style={{ padding: '40px 24px' }}>
              <EmptyState title="Your bag is empty"
                          message="Browse the library and add the chapters you want to buy."/>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 20px' }}>
              {items.map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
                                         padding: '12px 14px', background: 'var(--notati-paper)',
                                         border: '1px solid var(--border-2)', borderRadius: 'var(--r-5)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 'var(--r-3)', flexShrink: 0,
                                background: 'var(--notati-walnut)', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: 'var(--notati-paper)',
                                fontSize: 14, fontWeight: 700 }}>
                    {i.chapterNumber}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--fg-1)', fontSize: 14, marginBottom: 1 }}>
                      {i.courseName} · Ch.{i.chapterNumber}
                    </div>
                    <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i.chapterTitle}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--notati-walnut)', marginTop: 4 }}>
                      BD {Number(i.price).toFixed(3)}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => onRemove(i.id)}
                          aria-label="Remove from bag"
                          style={{ flexShrink: 0, color: 'var(--notati-crimson)', padding: '6px 8px' }}>
                    <Icons.Trash size={14}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="bag-foot">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ font: 'var(--type-label)', letterSpacing: '.08em', color: 'var(--fg-3)' }}>TOTAL</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--notati-walnut)', fontFamily: 'var(--font-serif)' }}>
                BD {total.toFixed(3)}
              </span>
            </div>
            <button className="btn btn-primary btn-block" onClick={() => setCheckoutOpen(true)}>
              Checkout <Icons.ArrowRight size={16}/>
            </button>
          </div>
        )}
      </div>

      <BagCheckoutModal
        open={checkoutOpen}
        items={items}
        user={user}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={handleConfirm}/>
    </>
  );
}

/* ============================================================
   Customer Dashboard
   ============================================================ */
function CustomerDashboard({ user, onNav, onOpenNote, bag, onAddToBag, onRemoveFromBag }) {
  const { toast } = useToast();
  const [notes,   setNotes]   = useStateC([]);
  const [uploads, setUploads] = useStateC([]);
  const [loading, setLoading] = useStateC(true);

  useEffectC(() => {
    Promise.all([NotatiAPI.getNotes(), NotatiAPI.getUploads()])
      .then(([n, u]) => {
        setNotes(n);
        setUploads(u.filter(up => up.userId === user.id));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user.id]);

  const ready    = uploads.filter(u => u.status === 'reviewed').length;
  const pending  = uploads.filter(u => u.status === 'pending').length;
  const accessibleCount = notes.filter(n => NotatiStore.canReadNote(user.id, n)).length;

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
        <Stat hero label="Notes I can read"
              num={accessibleCount}
              delta={{ dir: 'up', text: `${notes.length} notes in the library` }}
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
                            onClick={() => { const n = notes.find(x => x.id === up.noteId); if (n) onOpenNote(n); }}>
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
            ) : featured.map(n => {
              const canRead = NotatiStore.canReadNote(user.id, n);
              const isFree  = !n.price || Number(n.price) === 0;
              const inBag   = bag && bag.some(i => i.id === n.id);
              return (
                <div key={n.id} className={`notecard ${canRead ? '' : 'notecard-locked'}`}
                     onClick={canRead ? () => onOpenNote(n) : undefined}
                     style={{ position: 'relative', cursor: canRead ? 'pointer' : 'default' }}>
                  {isFree && (
                    <span style={{ position: 'absolute', top: 10, right: 10,
                                   background: 'var(--notati-sage)', color: 'var(--notati-paper)',
                                   font: 'var(--type-label)', fontSize: 10, padding: '2px 8px',
                                   borderRadius: 'var(--r-pill)' }}>FREE</span>
                  )}
                  {canRead && !isFree && (
                    <span style={{ position: 'absolute', top: 10, right: 10,
                                   background: 'var(--notati-walnut)', color: 'var(--notati-paper)',
                                   font: 'var(--type-label)', fontSize: 10, padding: '2px 8px',
                                   borderRadius: 'var(--r-pill)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Icons.Check size={9}/> For you
                    </span>
                  )}
                  {inBag && !canRead && (
                    <span style={{ position: 'absolute', top: 10, right: 10,
                                   background: 'var(--notati-sage)', color: 'var(--notati-paper)',
                                   font: 'var(--type-label)', fontSize: 10, padding: '2px 8px',
                                   borderRadius: 'var(--r-pill)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Icons.Bag size={9}/> In bag
                    </span>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 4 }}>{n.college}</div>
                  <span className="course">{n.courseName}</span>
                  <div className="title">{n.title}</div>
                  <div className="desc">{n.description}</div>
                  <div className="tags">
                    {(n.tags || []).slice(0, 2).map(t => <span key={t} className="tag tag-soft">{t}</span>)}
                  </div>
                  <div className="foot">
                    <span>{fmtDate(n.publishedAt)}</span>
                    {canRead ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--notati-walnut)', fontWeight: 700 }}>
                        Read <Icons.ArrowRight size={13}/>
                      </span>
                    ) : !isFree ? (
                      inBag ? (
                        <button className="btn btn-sm btn-in-bag"
                                onClick={(e) => { e.stopPropagation(); onRemoveFromBag && onRemoveFromBag(n.id); }}>
                          <Icons.Check size={12}/> In bag
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-sm"
                                onClick={(e) => { e.stopPropagation(); onAddToBag && onAddToBag(n); toast.success('Added to bag', n.title); }}>
                          <Icons.Bag size={12}/> Add to bag
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
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
  const [college, setCollege]           = useStateC('');
  const [courseName, setCourseName]     = useStateC('');
  const [chapterNumber, setChapterNumber] = useStateC('');
  const [chapterTitle, setChapterTitle] = useStateC('');
  const [description, setDescription]   = useStateC('');
  const [file, setFile]   = useStateC(null);
  const [err, setErr]     = useStateC('');
  const [busy, setBusy]   = useStateC(false);
  const [drag, setDrag]   = useStateC(false);
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
  }

  function onDrop(e) {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(f);
  }

  function clearForm() {
    setCollege(''); setCourseName(''); setChapterNumber(''); setChapterTitle('');
    setDescription(''); setFile(null); setErr('');
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    if (!college)              { setErr('Select your college.');       setBusy(false); return; }
    if (!courseName.trim())    { setErr('Enter the course name.');     setBusy(false); return; }
    if (!chapterNumber.trim()) { setErr('Enter the chapter number.');  setBusy(false); return; }
    if (!chapterTitle.trim())  { setErr('Enter the chapter title.');   setBusy(false); return; }
    if (!file)                 { setErr('Pick a file first.');         setBusy(false); return; }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['pdf','pptx','docx'].includes(ext)) {
      setErr('We only accept .pdf, .pptx, or .docx for now.'); setBusy(false); return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', `${courseName} — Ch.${chapterNumber}: ${chapterTitle}`);
    fd.append('description', description || '');
    fd.append('college', college);
    fd.append('course_name', courseName);
    fd.append('chapter_number', chapterNumber);
    fd.append('chapter_title', chapterTitle);
    try {
      await NotatiAPI.submitUpload(fd);
      toast.success('Submitted for review', "We will be in touch when your Note is ready.");
      clearForm();
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
              <label>College</label>
              <select value={college} onChange={(e) => setCollege(e.target.value)} required>
                <option value="">Select your college…</option>
                {COLLEGES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Course name</label>
              <input value={courseName} onChange={(e) => setCourseName(e.target.value)}
                     placeholder="e.g. ACC112, MGMT 233, CS 220" required/>
              <div className="hint">Use the official course code from your syllabus.</div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Chapter number</label>
                <input value={chapterNumber} onChange={(e) => setChapterNumber(e.target.value)}
                       placeholder="e.g. 4" required/>
              </div>
              <div className="field">
                <label>Chapter title</label>
                <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)}
                       placeholder="e.g. Motivation Theories" required/>
              </div>
            </div>
            <div className="field">
              <label>Description <span style={{ opacity: .5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                        placeholder="Anything we should know — exam date, weak spots, specific topics…"/>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="submit" className="btn btn-primary" disabled={busy || !file}>
                {busy ? 'Submitting…' : 'Submit for review'}
                {!busy && <Icons.ArrowRight size={16}/>}
              </button>
              <button type="button" className="btn btn-ghost" onClick={clearForm}>
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
  const [uploads, setUploads] = useStateC([]);
  const [notes,   setNotes]   = useStateC([]);
  const [loading, setLoading] = useStateC(true);
  const [q, setQ] = useStateC('');
  const [filter, setFilter] = useStateC('all');

  function reload() {
    return Promise.all([NotatiAPI.getUploads(), NotatiAPI.getNotes()])
      .then(([u, n]) => {
        setUploads(u.filter(up => up.userId === user.id));
        setNotes(n);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffectC(() => { reload(); }, [user.id]);

  useEffectC(() => {
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
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
    const n = notes.find(x => x.id === up.noteId);
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
                <div className="ttl">{up.chapterTitle || up.title}</div>
                <div className="meta">
                  {up.college && <><span>{up.college}</span> · </>}
                  {up.courseName && <><span>{up.courseName}</span>{up.chapterNumber ? ` Ch.${up.chapterNumber}` : ''} · </>}
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
   FilterDropdown — reusable styled dropdown (college & course)
   props: value, onChange, options [{val,lbl}], placeholder, icon
   ============================================================ */
function FilterDropdown({ value, onChange, options, placeholder, icon }) {
  const [open, setOpen] = useStateC(false);
  const ref = useRefC();

  useEffectC(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const active = value !== 'all';
  const label  = active ? (options.find(o => o.val === value) || {}).lbl || value : placeholder;
  const allOptions = [{ val: 'all', lbl: placeholder }, ...options];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button"
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-soft'}`}
              style={{ borderRadius: 'var(--r-pill)', gap: 6 }}
              onClick={() => setOpen(o => !o)}>
        {icon}
        {label}
        <span style={{ fontSize: 9, opacity: .7, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: 'var(--notati-paper)', border: '1px solid var(--border-1)',
          borderRadius: 'var(--r-5)', boxShadow: '0 8px 24px rgba(0,0,0,.13)',
          minWidth: 270, maxHeight: 300, overflowY: 'auto'
        }}>
          {allOptions.map(({ val, lbl }) => (
            <button key={val} type="button"
                    onClick={() => { onChange(val); setOpen(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '9px 16px', border: 'none', cursor: 'pointer',
                      font: 'var(--type-body)', fontSize: 14,
                      background: value === val ? 'var(--notati-cream)' : 'transparent',
                      color: value === val ? 'var(--notati-walnut)' : 'var(--fg-1)',
                      fontWeight: value === val ? 700 : 400,
                      borderLeft: value === val ? '3px solid var(--notati-walnut)' : '3px solid transparent'
                    }}>
              {lbl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Notes Library — two-level browse: course grid → chapter list
   ============================================================ */
function NotesLibrary({ user, onOpenNote, bag, onAddToBag, onRemoveFromBag }) {
  const { toast } = useToast();
  const [notes,   setNotes]   = useStateC([]);
  const [loading, setLoading] = useStateC(true);
  const [q, setQ] = useStateC('');

  useEffectC(() => {
    NotatiAPI.getNotes()
      .then(n => { setNotes(n); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  const [college, setCollege] = useStateC('all');
  const [selectedCourse, setSelectedCourse] = useStateC(null);

  // College filter resets course selection
  function pickCollege(c) {
    setCollege(c);
    setSelectedCourse(null);
    setQ('');
  }

  // Group notes into courses for the grid view
  const courses = useMemoC(() => {
    const pool = college === 'all' ? notes : notes.filter(n => n.college === college);
    const map = {};
    pool.forEach(n => {
      if (!map[n.courseName]) map[n.courseName] = { courseName: n.courseName, college: n.college, notes: [] };
      map[n.courseName].notes.push(n);
    });
    Object.values(map).forEach(c => c.notes.sort((a, b) => Number(a.chapterNumber) - Number(b.chapterNumber)));
    const ql = q.trim().toLowerCase();
    return Object.values(map).filter(c =>
      !ql || c.courseName.toLowerCase().includes(ql) || c.college.toLowerCase().includes(ql)
    );
  }, [notes, college, q]);

  // Chapters for the selected course
  const courseChapters = useMemoC(() => {
    if (!selectedCourse) return [];
    return notes
      .filter(n => n.courseName === selectedCourse)
      .sort((a, b) => Number(a.chapterNumber) - Number(b.chapterNumber));
  }, [notes, selectedCourse]);

  /* ---- Level 2: Chapter list ---- */
  if (selectedCourse) {
    const courseCollege = courseChapters[0]?.college || '';
    const freeCount = courseChapters.filter(n => !n.price || Number(n.price) === 0).length;
    const paidCount = courseChapters.length - freeCount;

    return (
      <div>
        <div className="page-head">
          <div className="ttl">
            <span className="tag tag-soft">04 · Library</span>
            <h1>{selectedCourse}</h1>
            <p className="sub">
              {courseCollege} · {courseChapters.length} chapter{courseChapters.length !== 1 ? 's' : ''}
              {freeCount > 0 && ` · ${freeCount} free`}
              {paidCount > 0 && ` · ${paidCount} paid`}
            </p>
          </div>
          <div className="actions">
            <button className="btn btn-outline" onClick={() => { setSelectedCourse(null); setQ(''); }}>
              <Icons.ArrowLeft size={16}/> All courses
            </button>
          </div>
        </div>

        <section className="panel">
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {courseChapters.map(n => {
              const canRead = NotatiStore.canReadNote(user.id, n);
              const isFree  = !n.price || Number(n.price) === 0;
              const inBag   = bag && bag.some(i => i.id === n.id);
              return (
                <div key={n.id}
                     style={{ cursor: canRead ? 'pointer' : 'default', padding: '14px 16px',
                              borderRadius: 'var(--r-5)', border: '1px solid var(--border-2)',
                              background: 'var(--notati-paper)', display: 'flex', alignItems: 'center', gap: 14 }}
                     onClick={canRead ? () => onOpenNote(n) : undefined}>

                  {/* Chapter number bubble */}
                  <div style={{ width: 42, height: 42, borderRadius: 'var(--r-3)', flexShrink: 0,
                                background: isFree ? 'var(--notati-sage)' : canRead ? 'var(--notati-walnut)' : inBag ? 'var(--notati-forest)' : 'var(--notati-cream)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: (isFree || canRead || inBag) ? 'var(--notati-paper)' : 'var(--fg-3)',
                                fontSize: 16, fontWeight: 700 }}>
                    {n.chapterNumber}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', marginBottom: 2 }}>
                      Ch.{n.chapterNumber}: {n.chapterTitle}
                    </div>
                    <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                      {n.title}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {isFree ? (
                      <span style={{ background: 'var(--notati-sage)', color: 'var(--notati-paper)',
                                     font: 'var(--type-label)', fontSize: 10, padding: '3px 10px',
                                     borderRadius: 'var(--r-pill)' }}>FREE</span>
                    ) : canRead ? (
                      <span style={{ background: 'var(--notati-walnut)', color: 'var(--notati-paper)',
                                     font: 'var(--type-label)', fontSize: 10, padding: '3px 10px',
                                     borderRadius: 'var(--r-pill)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Icons.Check size={9}/> For you
                      </span>
                    ) : inBag ? (
                      <button className="btn btn-sm btn-in-bag"
                              onClick={(e) => { e.stopPropagation(); onRemoveFromBag && onRemoveFromBag(n.id); }}>
                        <Icons.Check size={12}/> In bag
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-sm"
                              onClick={(e) => { e.stopPropagation(); onAddToBag && onAddToBag(n); toast.success('Added to bag', `${n.courseName} Ch.${n.chapterNumber}`); }}>
                        <Icons.Bag size={12}/> BD {Number(n.price).toFixed(3)}
                      </button>
                    )}
                    {canRead && (
                      <button className="btn btn-soft btn-sm"
                              onClick={(e) => { e.stopPropagation(); onOpenNote(n); }}>
                        Read <Icons.ArrowRight size={14}/>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
    );
  }

  /* ---- Level 1: Course grid ---- */
  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <span className="tag tag-soft">04 · Library</span>
          <h1>Notes library</h1>
          <p className="sub">Browse by course. Free chapters are readable instantly — paid chapters are unlocked after payment via BenefitPay.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 10 }}>
          <FilterDropdown
            value={college}
            onChange={pickCollege}
            options={COLLEGES.map(c => ({ val: c, lbl: c }))}
            placeholder="All colleges"
            icon={<Icons.Filter size={13}/>}/>

          <div className="search-mini" style={{ minWidth: 260, marginLeft: 'auto' }}>
            <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by course name…"/>
          </div>
        </div>

        <div className="panel-body">
          {courses.length === 0 ? (
            <EmptyState title="No courses yet"
                        message={notes.length === 0
                          ? "The library is empty — check back soon."
                          : "No courses match these filters. Try a broader search."}/>
          ) : (
            <div className="grid-3">
              {courses.map(({ courseName, college: coll, notes: cNotes }) => {
                const freeCount = cNotes.filter(n => !n.price || Number(n.price) === 0).length;
                const paidCount = cNotes.length - freeCount;
                return (
                  <div key={courseName}
                       className="notecard"
                       onClick={() => setSelectedCourse(courseName)}
                       style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 4 }}>{coll}</div>
                    <span className="course">{courseName}</span>
                    <div className="title">{cNotes.length} chapter{cNotes.length !== 1 ? 's' : ''} available</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {freeCount > 0 && (
                        <span style={{ background: 'var(--notati-sage)', color: 'var(--notati-paper)',
                                       font: 'var(--type-label)', fontSize: 10, padding: '3px 10px',
                                       borderRadius: 'var(--r-pill)' }}>
                          {freeCount} free
                        </span>
                      )}
                      {paidCount > 0 && (
                        <span style={{ background: 'var(--notati-cream)', color: 'var(--fg-2)',
                                       border: '1px solid var(--border-2)',
                                       font: 'var(--type-label)', fontSize: 10, padding: '3px 10px',
                                       borderRadius: 'var(--r-pill)' }}>
                          {paidCount} paid
                        </span>
                      )}
                    </div>
                    <div className="foot">
                      <span style={{ opacity: .5 }}>{fmtDate(cNotes[0].publishedAt)}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                     color: 'var(--notati-walnut)', fontWeight: 700 }}>
                        Browse chapters <Icons.ArrowRight size={13}/>
                      </span>
                    </div>
                  </div>
                );
              })}
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
    if (note.pdfFile) {
      window.open(note.pdfFile, '_blank');
    } else {
      NotatiStore.fakeDownload(note.fileName || note.title + '.pdf');
      toast.success('Download started', note.fileName || note.title);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg"
           title={note.title}
           subtitle={`${note.college} · ${note.courseName} · Ch.${note.chapterNumber}: ${note.chapterTitle} · ${fmtDate(note.publishedAt)}`}
           footer={<>
             <button className="btn btn-ghost" onClick={onClose}>Close</button>
             <button className="btn btn-primary" onClick={download}>
               <Icons.Download size={15}/> Download PDF
             </button>
           </>}>
      {(note.tags || []).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {note.tags.map(t => <span key={t} className="tag tag-soft">{t}</span>)}
        </div>
      )}
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
                           color: 'var(--fg-3)', textTransform: 'uppercase' }}>{note.courseName} · Ch.{note.chapterNumber}</span>
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

Object.assign(window, { CustomerDashboard, UploadContent, MyUploads, NotesLibrary, NoteReader, BagDrawer, BagCheckoutModal });
