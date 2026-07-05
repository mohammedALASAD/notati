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
  benefitpay:   '+973 3930 9797',
  whatsapp:     '97339309797',
  instagram:    'notati_notes',
  instagramUrl: 'https://www.instagram.com/notati_notes?igsh=MWtheTA1MWt2bGdobw%3D%3D&utm_source=qr',
  email:        'support@notati.app',
};
const WA_DEFAULT_MSG = encodeURIComponent('Hi! I\'d like to purchase notes from Notati. Can you help me?');

/* ============================================================
   Note file helpers — shared preview/download logic for multi-file notes
   openReader: function that opens the NoteReader modal for a given note
   toast: the toast object from useToast()
   ============================================================ */
function _buildNoteFilename(nf) {
  const ext = nf.filename ? nf.filename.split('.').pop() : 'pdf';
  if (nf.label) return nf.label.replace(/[/\\?%*:|"<>]/g, '_') + '.' + ext;
  return nf.filename || 'file.pdf';
}

function _previewNote(n, openReader, toast) {
  const files = n.files || [];
  if (files.length === 0) { toast.info('No file', 'No PDF attached yet.'); return; }
  const f = files[0];
  if (files.length > 1) {
    toast.info(`${files.length} files`, 'Opening file 1 - use Preview to access all files.');
  }
  if (f.id) NotatiAPI.previewNoteFileById(f.id).catch(e => toast.error('Preview failed', e.message));
  else NotatiAPI.previewNoteFile(n._numId).catch(e => toast.error('Preview failed', e.message));
}

function _downloadNote(n, openReader, toast) {
  const files = n.files || [];
  if (files.length === 0) { toast.info('No file', 'No PDF attached yet.'); return; }
  files.forEach(f => {
    if (f.id) NotatiAPI.downloadNoteFileById(f.id, _buildNoteFilename(f)).catch(e => toast.error('Download failed', e.message));
    else NotatiAPI.downloadNoteFile(n._numId, n.fileName || n.title + '.pdf').catch(e => toast.error('Download failed', e.message));
  });
}

/* ============================================================
   Note Details Modal — lets a student preview a locked note before
   buying: its description + how many files it includes, plus quick
   Sample / Add to bag actions.
   ============================================================ */
function NoteDetailsModal({ open, note, bag, pendingNoteIds, onAddToBag, onRemoveFromBag, onClose }) {
  const { toast } = useToast();
  if (!open || !note) return null;

  const files     = note.files || [];
  const fileCount = files.length;
  const inBag     = bag && bag.some(i => i.id === note.id);
  const isFree    = !note.price || Number(note.price) === 0;
  const pending   = pendingNoteIds && pendingNoteIds.has(note._numId);

  function sampleFile(f) {
    const ok = (f && f.id) ? NotatiAPI.openSampleFile(f.id) : NotatiAPI.openSample(note);
    if (!ok) toast.error('Preview blocked', 'Please allow pop-ups for this site, then try again.');
  }

  return (
    <Modal open={open} onClose={onClose} size="md"
           title={`Ch.${note.chapterNumber}: ${note.chapterTitle}`}
           subtitle={`${note.courseName}${note.college ? ' · ' + note.college : ''}`}
           footer={<>
             <button className="btn btn-ghost" onClick={onClose}>Close</button>
             {!isFree && (pending ? (
               <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px',
                              color: 'var(--notati-bark, #8a6d3b)', fontWeight: 700 }}>
                 <Icons.Clock size={15}/> Waiting for approval
               </span>
             ) : inBag ? (
               <button className="btn btn-in-bag" onClick={() => onRemoveFromBag && onRemoveFromBag(note.id)}>
                 <Icons.Check size={15}/> In bag
               </button>
             ) : (
               <button className="btn btn-primary"
                       onClick={() => { onAddToBag && onAddToBag(note); toast.success('Added to bag', `${note.courseName} Ch.${note.chapterNumber}`); }}>
                 <Icons.Bag size={15}/> Add · BD {Number(note.price).toFixed(3)}
               </button>
             ))}
           </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Description */}
        <div>
          <div style={{ font: 'var(--type-label)', color: 'var(--fg-3)', marginBottom: 8, letterSpacing: '.08em' }}>
            DESCRIPTION
          </div>
          <div style={{ font: 'var(--type-body)', fontSize: 14, lineHeight: 1.6,
                        color: note.description ? 'var(--fg-1)' : 'var(--fg-3)' }}>
            {note.description || 'No description provided for this chapter.'}
          </div>
        </div>

        {/* What's inside */}
        <div>
          <div style={{ font: 'var(--type-label)', color: 'var(--fg-3)', marginBottom: 8, letterSpacing: '.08em' }}>
            WHAT'S INSIDE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                        font: 'var(--type-body)', fontSize: 14, fontWeight: 600, color: 'var(--fg-1)',
                        marginBottom: fileCount ? 10 : 0 }}>
            <Icons.Folder size={16}/>
            {fileCount > 0
              ? `Includes ${fileCount} file${fileCount !== 1 ? 's' : ''}`
              : 'No files attached yet'}
          </div>
          {fileCount > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map((f, i) => (
                <div key={f.id || i}
                     style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                              background: 'var(--bg-section)', border: '1px solid var(--border-2)',
                              borderRadius: 'var(--r-4)', fontSize: 13, color: 'var(--fg-2)' }}>
                  <FileTypeChip type="pdf"/>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.filename || f.label || `File ${i + 1}`}
                  </span>
                  <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}
                          onClick={() => sampleFile(f)}>
                    <Icons.Eye size={13}/> Sample
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   Bag Checkout Modal — shows all bag items + BenefitPay + WhatsApp
   ============================================================ */
function BagCheckoutModal({ open, items, user, onClose, onConfirm }) {
  const [copied,     setCopied]     = useStateC(false);
  const [code,       setCode]       = useStateC('');
  const [applied,    setApplied]    = useStateC(null);   // { code, percent }
  const [checking,   setChecking]   = useStateC(false);
  const [codeErr,    setCodeErr]    = useStateC('');
  const [submitting, setSubmitting] = useStateC(false);
  const [orderCode,  setOrderCode]  = useStateC('');
  useEffectC(() => {
    if (!open) { setCopied(false); setCode(''); setApplied(null); setCodeErr(''); setChecking(false); setSubmitting(false); setOrderCode(''); }
    else setOrderCode(NotatiStore.orderCodeFor(items));   // stable per bag contents
  }, [open]);
  if (!open || !items || items.length === 0) return null;

  const subtotal = items.reduce((s, i) => s + Number(i.price), 0);
  // Round to 3 dp the same way the backend does, so the displayed and charged totals agree.
  const discountAmount = applied ? Math.round((subtotal * applied.percent / 100) * 1000) / 1000 : 0;
  const total = subtotal - discountAmount;

  async function applyCode() {
    const c = code.trim();
    if (!c) return;
    setChecking(true); setCodeErr('');
    try {
      const res = await NotatiAPI.validateDiscount(c);
      setApplied({ code: res.code, percent: res.percent });
      setCodeErr('');
    } catch (e) {
      setApplied(null);
      setCodeErr(e.message || 'This code is not valid.');
    } finally {
      setChecking(false);
    }
  }
  function removeCode() { setApplied(null); setCode(''); setCodeErr(''); }

  function copyNumber() {
    navigator.clipboard.writeText(CONTACT.benefitpay).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const itemLines = items.map(i =>
    `- ${i.courseName} Ch.${i.chapterNumber}: ${i.chapterTitle} (BD ${Number(i.price).toFixed(3)})`
  ).join('\n');
  const discountLines = applied
    ? `\nSubtotal: BD ${subtotal.toFixed(3)}\nDiscount code ${applied.code} (${applied.percent}% off): -BD ${discountAmount.toFixed(3)}`
    : '';
  const waMsg = encodeURIComponent(
    `Hi, I would like to purchase the following notes:\nOrder code: ${orderCode}\n${itemLines}${discountLines}\nTotal: BD ${total.toFixed(3)}\nMy Notati email: ${user.email}`
  );

  // Guard against double-submission: once the order is being placed the button
  // is disabled, so a second click can't create a duplicate order.
  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    const ok = await onConfirm(applied ? applied.code : null, orderCode);
    if (!ok) setSubmitting(false);   // on success the modal closes and unmounts
  }

  return (
    <Modal open={open} onClose={submitting ? undefined : onClose} size="lg"
           title="Checkout"
           subtitle={`${items.length} item${items.length !== 1 ? 's' : ''} · Total BD ${total.toFixed(3)}`}
           footer={<>
             <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
             <button className="btn btn-primary" onClick={confirm} disabled={submitting}>
               {submitting
                 ? <>Placing order…</>
                 : <><Icons.Check size={16}/> Done, I have paid</>}
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
                                       padding: '10px 14px', background: 'var(--bg-section)',
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
            {applied && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px 0',
                              font: 'var(--type-body)', fontSize: 13, color: 'var(--fg-2)' }}>
                  <span>Subtotal</span><span>BD {subtotal.toFixed(3)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 14px 0',
                              font: 'var(--type-body)', fontSize: 13, color: 'var(--notati-forest)' }}>
                  <span>Discount · {applied.code} ({applied.percent}%)</span>
                  <span>−BD {discountAmount.toFixed(3)}</span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 14px', borderTop: '2px solid var(--border-1)', marginTop: 2 }}>
              <span style={{ font: 'var(--type-label)', letterSpacing: '.08em', color: 'var(--fg-2)' }}>TOTAL</span>
              <span style={{ font: 'var(--type-h3)', color: 'var(--notati-walnut)', fontSize: 22, fontWeight: 800 }}>
                BD {total.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* Discount code */}
        <div>
          <div style={{ font: 'var(--type-label)', color: 'var(--fg-3)', marginBottom: 10, letterSpacing: '.08em' }}>
            DISCOUNT CODE
          </div>
          {applied ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          padding: '12px 14px', background: 'rgba(122, 155, 107, .12)',
                          border: '1px solid var(--notati-sage)', borderRadius: 'var(--r-5)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--notati-forest)', fontWeight: 700 }}>
                <Icons.Check size={15}/> {applied.code} applied · {applied.percent}% off
              </span>
              <button className="btn btn-ghost btn-sm" onClick={removeCode}>Remove</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={code}
                       onChange={e => { setCode(e.target.value.toUpperCase()); setCodeErr(''); }}
                       onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } }}
                       placeholder="Enter a code"
                       style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--r-5)',
                                border: '1px solid var(--border-1)', background: 'var(--bg-section)',
                                color: 'var(--fg-1)', font: 'var(--type-body)', letterSpacing: '.05em',
                                textTransform: 'uppercase' }}/>
                <button className="btn btn-soft" onClick={applyCode} disabled={checking || !code.trim()}>
                  {checking ? 'Checking…' : 'Apply'}
                </button>
              </div>
              {codeErr && (
                <div style={{ marginTop: 8, font: 'var(--type-caption)', fontStyle: 'normal',
                              fontSize: 12, color: 'var(--notati-crimson)' }}>{codeErr}</div>
              )}
            </>
          )}
        </div>

        {/* Steps */}
        <div>
          <div style={{ font: 'var(--type-label)', color: 'var(--fg-3)', marginBottom: 10, letterSpacing: '.08em' }}>
            HOW TO COMPLETE PAYMENT
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['1', `Send BD ${total.toFixed(3)} via BenefitPay to the number below.`],
              ['2', 'Tap WhatsApp - your order list is pre-filled. Just hit send.'],
              ['3', 'We will unlock all your chapters - usually within a few hours.']
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
        <div style={{ background: 'var(--bg-section)', border: '1px solid var(--border-1)',
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
          <a href={CONTACT.instagramUrl}
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
function BagDrawer({ open, items, user, onClose, onRemove, onClear, onOrdered }) {
  const { toast } = useToast();
  const [checkoutOpen, setCheckoutOpen] = useStateC(false);

  useEffectC(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const total = items.reduce((s, i) => s + Number(i.price), 0);

  async function handleConfirm(discountCode, orderCode) {
    // Record a pending order so the admin gets a tracked order they can mark
    // paid + unlock in one click. Send the note ids from the bag the user sees.
    // Returns true on success / false on failure so the modal can re-enable its button.
    const noteIds = items.map(i => i._numId).filter(Boolean);
    try {
      await NotatiAPI.createOrder(noteIds, discountCode, orderCode);
    } catch (e) {
      toast.error('Could not place order', e.message || 'Please try again.');
      return false; // keep the bag and modal so the user can retry
    }
    onClear();
    NotatiStore.clearOrderCode();       // this bag is now an order — next order gets a fresh code
    onOrdered && onOrdered(noteIds);   // mark these chapters "waiting for approval"
    setCheckoutOpen(false);
    onClose();
    toast.success('Order placed', 'We received your order. Your notes unlock once we confirm payment.');
    return true;
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
                                         padding: '12px 14px', background: 'var(--bg-card)',
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
function CustomerDashboard({ user, onNav, onOpenNote, onShowDetails, bag, onAddToBag, onRemoveFromBag }) {
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

  const ready    = uploads.filter(u => u.status === 'approved').length;
  const pending  = uploads.filter(u => u.status === 'pending').length;
  const accessibleCount = notes.filter(n => NotatiStore.canReadNote(user.id, n)).length;

  const recentUploads = uploads.slice(0, 4);

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <h1>Hey {user.name.split(' ')[0]}, ready to study?</h1>
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

      {loading ? <PageLoader variant="stats" rows={3}/> : (
        <div className="stats fade-in">
          <Stat hero label="Notes I can read"
                num={accessibleCount}
                delta={{ dir: 'up', text: `${notes.length} notes in the library` }}
                icon="Library"
                onClick={() => onNav('mynotes')} navLabel="Open my notes"/>
          <Stat tone="sage" label="Notes library" num={notes.length}
                delta={{ text: 'Browse every chapter' }}
                icon="Library"
                onClick={() => onNav('library')} navLabel="Go to library"/>
          <Stat tone="walnut" label="My uploads" num={uploads.length}
                delta={{ text: `${ready} ready · ${pending} pending` }}
                icon="Upload"
                onClick={() => onNav('uploads')} navLabel="View uploads"/>
        </div>
      )}

      <section className="panel">
          <div className="panel-head">
            <h3>Your recent uploads</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('uploads')}>
              View all <Icons.ArrowRight size={14}/>
            </button>
          </div>
          <div className="panel-body">
            {loading ? <PageLoader variant="table" rows={3}/> : recentUploads.length === 0 ? (
              <EmptyState title="Turn your own slides into clean study notes, free"
                          message="Send us any lecture .pptx, .docx or .pdf and we'll rebuild it into a tidy, easy-to-study Notati note. Notes made from your own files are always free - it's our way of saying thanks for sharing."
                          action={<button className="btn btn-primary" onClick={() => onNav('upload')}>
                                    <Icons.Upload size={16}/> Upload your first file
                                  </button>}/>
            ) : (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recentUploads.map(up => (
                  <div key={up.id} className="filerow">
                    <FileTypeChip type={up.fileType}/>
                    <div className="body">
                      <div className="ttl">{up.title}</div>
                      <div className="meta">{up.fileName} · {fmtRelative(up.uploadedAt)} · {fmtSize(up.sizeKB)}</div>
                    </div>
                    <div className="acts">
                      {up.status === 'approved' ? (
                        <button className="btn btn-soft btn-sm"
                                onClick={() => { const n = notes.find(x => x.id === up.noteId); if (n) onOpenNote(n); }}>
                          Read note <Icons.ArrowRight size={14}/>
                        </button>
                      ) : <StatusBadge status="pending"/>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      <TestimonialForm user={user}/>
    </div>
  );
}

/* ============================================================
   Testimonial submit form (shown on student dashboard)
   ============================================================ */
function TestimonialForm({ user }) {
  const { toast } = useToast();
  const [text,    setText]    = useStateC('');
  const [course,  setCourse]  = useStateC('');
  const [sending, setSending] = useStateC(false);
  const [done,    setDone]    = useStateC(false);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await NotatiAPI.submitTestimonial({ text: text.trim(), course: course.trim() });
      setDone(true);
      setText('');
      setCourse('');
      toast.success('Review submitted', 'Thanks! It will appear once approved.');
    } catch(e) {
      toast.error('Could not submit', 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <div className="panel-head">
        <h3>Share your experience</h3>
      </div>
      <div className="panel-body">
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--fg-2)' }}>
            <Icons.Check size={28} style={{ color: 'var(--notati-sage)', marginBottom: 8 }}/>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Review submitted</div>
            <div style={{ fontSize: 13 }}>It will show on the login page once approved.</div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}
                    onClick={() => setDone(false)}>Submit another</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Your review <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>(max 300 chars)</span></label>
              <textarea rows={3} maxLength={300} required
                        placeholder="How did Notati help you? Be honest."
                        value={text} onChange={e => setText(e.target.value)}
                        style={{ resize: 'vertical', minHeight: 80 }}/>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
                {text.length}/300
              </div>
            </div>
            <div className="field">
              <label>Course <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>(optional, e.g. MGMT 233)</span></label>
              <input type="text" maxLength={50} placeholder="MGMT 233"
                     value={course} onChange={e => setCourse(e.target.value)}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={sending || !text.trim()}>
                {sending ? 'Submitting…' : 'Submit review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
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
  const [pendingFiles, setPendingFiles] = useStateC([]);  // [{tmpId, label, file}]
  const [pickingForIdx, setPickingForIdx] = useStateC(null);
  const [err, setErr]     = useStateC('');
  const [busy, setBusy]   = useStateC(false);
  const fileInputRef = useRefC();

  function addPendingFile() {
    setPendingFiles(prev => [...prev, { tmpId: Date.now(), label: '', file: null }]);
  }

  function removePending(idx) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function updateLabel(idx, val) {
    setPendingFiles(prev => prev.map((pf, i) => i === idx ? { ...pf, label: val } : pf));
  }

  function openFilePicker(idx) {
    setPickingForIdx(idx);
    if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
  }

  function handleFilePicked(e) {
    const f = e.target.files && e.target.files[0];
    if (!f || pickingForIdx === null) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'pptx', 'docx'].includes(ext)) {
      setErr('We only accept .pdf, .pptx, or .docx for now.'); return;
    }
    setErr('');
    setPendingFiles(prev => prev.map((pf, i) => i === pickingForIdx ? { ...pf, file: f } : pf));
    setPickingForIdx(null);
  }

  function clearForm() {
    setCollege(''); setCourseName(''); setChapterNumber(''); setChapterTitle('');
    setDescription(''); setPendingFiles([]); setErr('');
  }

  const pickedFiles = pendingFiles.filter(pf => pf.file);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    if (!college)              { setErr('Select your college.');       setBusy(false); return; }
    if (!courseName.trim())    { setErr('Enter the course name.');     setBusy(false); return; }
    if (!chapterNumber.trim()) { setErr('Enter the chapter number.');  setBusy(false); return; }
    if (!chapterTitle.trim())  { setErr('Enter the chapter title.');   setBusy(false); return; }
    if (pickedFiles.length === 0) { setErr('Add at least one file before submitting.'); setBusy(false); return; }
    try {
      const fd = new FormData();
      fd.append('title', `${courseName} - Ch.${chapterNumber}: ${chapterTitle}`);
      fd.append('description', description || '');
      fd.append('college', college);
      fd.append('course_name', courseName);
      fd.append('chapter_number', chapterNumber);
      fd.append('chapter_title', chapterTitle);
      const upload = await NotatiAPI.submitUpload(fd);
      for (const pf of pickedFiles) {
        await NotatiAPI.addUploadFile(upload.id, pf.file, pf.label);
      }
      toast.success('Submitted for review', "We will be in touch when your Note is ready.");
      clearForm();
      setTimeout(() => { setBusy(false); onDone && onDone(); }, 300);
    } catch (e2) {
      setErr(e2.message); setBusy(false);
      toast.error('Could not upload', e2.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <h1>Send us something to summarise.</h1>
          <p className="sub">Drop a slide deck, a reading, or your own draft. We'll turn it into clean notes within a couple of days.</p>
        </div>
      </div>

      <form className="grid-2" onSubmit={submit}>
        <section className="panel">
          <div className="panel-head">
            <h3>Your files</h3>
            <button type="button" className="btn btn-soft btn-sm" onClick={addPendingFile}
                    style={{ marginLeft: 'auto' }}>
              <Icons.Plus size={13}/> Add a file
            </button>
          </div>
          <div className="panel-body">
            {pendingFiles.length === 0 ? (
              <div style={{ padding: '20px 16px', borderRadius: 'var(--r-5)', textAlign: 'center',
                            border: '1px dashed var(--border-1)', color: 'var(--fg-3)', fontSize: 13 }}>
                Click "Add a file" to attach your lecture slides, notes, or readings.
                <div style={{ display: 'inline-flex', gap: 8, marginTop: 10 }}>
                  <FileTypeChip type="pdf"/>
                  <FileTypeChip type="docx"/>
                  <FileTypeChip type="pptx"/>
                </div>
              </div>
            ) : (
              pendingFiles.map((pf, idx) => (
                <div key={pf.tmpId} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', marginBottom: 8, borderRadius: 'var(--r-5)',
                  border: '1px solid var(--border-1)', background: 'var(--bg-card)'
                }}>
                  {pf.file
                    ? <FileTypeChip type={(pf.file.name.split('.').pop() || '').toLowerCase()}/>
                    : <div style={{ width: 28, height: 28, borderRadius: 'var(--r-3)', flexShrink: 0,
                                     background: 'var(--bg-card-2)', border: '1px dashed var(--border-2)' }}/>}
                  <input
                    value={pf.label}
                    onChange={e => updateLabel(idx, e.target.value)}
                    placeholder="Label (optional, e.g. Lecture Slides)"
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
              ))
            )}
            <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                   accept=".pdf,.pptx,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                   onChange={handleFilePicked}/>
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
                        placeholder="Anything we should know, like exam date, weak spots, specific topics…"/>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="submit" className="btn btn-primary" disabled={busy || pickedFiles.length === 0}>
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
      if (filter === 'ready'   && up.status !== 'approved') return false;
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
    ready:   uploads.filter(u => u.status === 'approved').length,
    pending: uploads.filter(u => u.status === 'pending').length
  };

  return (
    <div>
      <div className="page-head">
        <div className="ttl">
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

        <div className="panel-body">
          {loading ? <PageLoader variant="table" rows={5}/> : filtered.length === 0 ? (
            uploads.length === 0
              ? <EmptyState title="No uploads yet"
                            message="Drop a .pptx, .docx or .pdf and we'll turn it into clean notes."
                            action={<button className="btn btn-primary" onClick={() => onNav('upload')}>
                                      <Icons.Upload size={16}/> Upload your first file
                                    </button>}/>
              : <EmptyState title="No matches"
                            message="Try a different filter or a broader search term."/>
          ) : (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(up => (
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
                    <StatusBadge status={up.status === 'approved' ? 'ready' : 'pending'}/>
                    {up.status === 'approved'
                      ? <button className="btn btn-primary btn-sm" onClick={() => openNote(up)}>
                          Read note <Icons.ArrowRight size={14}/>
                        </button>
                      : null}
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
          background: 'var(--bg-card)', border: '1px solid var(--border-1)',
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
                      background: value === val ? 'var(--bg-section)' : 'transparent',
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
function NotesLibrary({ user, onOpenNote, onShowDetails, bag, onAddToBag, onRemoveFromBag, pendingNoteIds, topbarSearch }) {
  const { toast } = useToast();
  const [notes,   setNotes]   = useStateC([]);
  const [loading, setLoading] = useStateC(true);
  const [q, setQ] = useStateC('');

  useEffectC(() => { setQ(topbarSearch || ''); }, [topbarSearch]);
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

  // College cards — unique colleges with course counts
  const collegeSummaries = useMemoC(() => {
    const map = {};
    notes.forEach(n => {
      if (!map[n.college]) map[n.college] = new Set();
      map[n.college].add(n.courseName);
    });
    return COLLEGES.filter(c => map[c]).map(c => ({ name: c, courseCount: map[c].size }));
  }, [notes]);

  /* ---- Level 2: Chapter list ---- */
  if (selectedCourse) {
    const courseCollege = courseChapters[0]?.college || '';
    const freeCount = courseChapters.filter(n => !n.price || Number(n.price) === 0).length;
    const paidCount = courseChapters.length - freeCount;

    // Chapters the student could still buy: paid, not already owned, not already
    // in the bag, and not already awaiting approval from a pending order.
    const buyable = courseChapters.filter(n => {
      const isFree  = !n.price || Number(n.price) === 0;
      const owned   = NotatiStore.canReadNote(user.id, n);
      const inBag   = bag && bag.some(i => i.id === n.id);
      const pending = pendingNoteIds && pendingNoteIds.has(n._numId);
      return !isFree && !owned && !inBag && !pending;
    });
    const buyableTotal = buyable.reduce((s, n) => s + Number(n.price), 0);

    function buyAllChapters() {
      buyable.forEach(n => onAddToBag && onAddToBag(n));
      toast.success('Added to bag', `${buyable.length} chapter${buyable.length !== 1 ? 's' : ''} added · BD ${buyableTotal.toFixed(3)}`);
    }

    return (
      <div className="fade-in">
        <div className="page-head">
          <div className="ttl">
            <h1>{selectedCourse}</h1>
            <p className="sub">
              {courseCollege} · {courseChapters.length} chapter{courseChapters.length !== 1 ? 's' : ''}
              {freeCount > 0 && ` · ${freeCount} free`}
              {paidCount > 0 && ` · ${paidCount} paid`}
            </p>
          </div>
          <div className="actions">
            {buyable.length > 0 && (
              <button className="btn btn-primary" onClick={buyAllChapters}>
                <Icons.Bag size={16}/> Buy all chapters · BD {buyableTotal.toFixed(3)}
              </button>
            )}
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
              const pending = !canRead && pendingNoteIds && pendingNoteIds.has(n._numId);
              return (
                <div key={n.id} className="chapter-row"
                     style={{ cursor: 'pointer' }}
                     onClick={canRead ? () => onOpenNote(n) : () => onShowDetails && onShowDetails(n)}>

                  {/* Chapter number bubble */}
                  <div className="chapter-bubble"
                       style={{ background: isFree ? 'var(--notati-sage)' : canRead ? 'var(--notati-walnut)' : pending ? 'var(--notati-bark, #8a6d3b)' : inBag ? 'var(--notati-forest)' : 'var(--bg-card-2)',
                                color: (isFree || canRead || inBag || pending) ? 'var(--notati-paper)' : 'var(--fg-3)' }}>
                    {n.chapterNumber}
                  </div>

                  <div className="chapter-row-meta">
                    <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', marginBottom: 2 }}>
                      Ch.{n.chapterNumber}: {n.chapterTitle}
                    </div>
                    <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                      {n.title}
                    </div>
                  </div>

                  <div className="chapter-row-actions">
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
                    ) : pending ? (
                      <span style={{ background: 'var(--notati-bark, #8a6d3b)', color: 'var(--notati-paper)',
                                     font: 'var(--type-label)', fontSize: 10, padding: '3px 10px',
                                     borderRadius: 'var(--r-pill)', display: 'inline-flex', alignItems: 'center',
                                     gap: 4, whiteSpace: 'nowrap' }}>
                        <Icons.Clock size={9}/> Waiting for approval
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
                    {!canRead && !isFree && (
                      <button className="btn btn-ghost btn-sm" title="Preview the first pages"
                              onClick={(e) => { e.stopPropagation(); if (!NotatiAPI.openSample(n)) toast.error('Preview blocked', 'Please allow pop-ups for this site, then try again.'); }}>
                        <Icons.Eye size={13}/> Sample
                      </button>
                    )}
                    {canRead && (
                      <>
                        <button className="btn btn-ghost btn-sm" title="Download"
                                onClick={(e) => { e.stopPropagation(); _downloadNote(n, onOpenNote, toast); }}>
                          <Icons.Download size={14}/>
                        </button>
                        <button className="btn btn-soft btn-sm"
                                onClick={(e) => { e.stopPropagation(); onOpenNote(n); }}>
                          <Icons.Eye size={13}/> Preview
                        </button>
                      </>
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

  /* ---- Level 0: College cards ---- */
  if (college === 'all' && !q.trim() && !selectedCourse) {
    return (
      <div className="fade-in">
        <div className="page-head">
          <div className="ttl">
            <h1>Notes library</h1>
            <p className="sub">Select your college to browse available courses.</p>
          </div>
          <div className="actions">
            <div className="search-mini" style={{ minWidth: 240 }}>
              <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all courses…"/>
            </div>
          </div>
        </div>
        <section className="panel">
          <div className="panel-body">
            {loading ? <PageLoader rows={4} variant="cards"/> : collegeSummaries.length === 0 ? (
              <EmptyState title="No courses yet" message="The library is empty - check back soon."/>
            ) : (
              <div className="grid-3 fade-in">
                {collegeSummaries.map(({ name, courseCount }) => (
                  <div key={name} className="notecard" style={{ cursor: 'pointer' }}
                       onClick={() => pickCollege(name)}>
                    <div className="title" style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{name}</div>
                    <p style={{ font: 'var(--type-body)', color: 'var(--fg-2)', fontSize: 14, margin: 0 }}>
                      {courseCount} course{courseCount !== 1 ? 's' : ''} available
                    </p>
                    <div className="foot">
                      <span/>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                     color: 'var(--notati-walnut)', fontWeight: 700 }}>
                        Browse courses <Icons.ArrowRight size={13}/>
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

  /* ---- Level 1: Course grid ---- */
  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <h1>{college !== 'all' ? college : 'Notes library'}</h1>
          <p className="sub">{college !== 'all' ? 'Browse by course.' : 'Search results'}</p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => pickCollege('all')}>
            <Icons.ArrowLeft size={16}/> All colleges
          </button>
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
          {loading ? <PageLoader rows={6} variant="cards"/> : courses.length === 0 ? (
            <EmptyState title="No courses yet"
                        message={notes.length === 0
                          ? "The library is empty - check back soon."
                          : "No courses match these filters. Try a broader search."}/>
          ) : (
            <div className="grid-3 fade-in">
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
                        <span style={{ background: 'transparent', color: 'var(--fg-2)',
                                       border: '1px solid var(--border-1)',
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
   NoteReader — note info + styled preview
   ============================================================ */
function NoteReader({ note, open, onClose }) {
  const { toast } = useToast();
  if (!open || !note) return null;

  const files = note.files || [];

  function downloadFile(nf) {
    if (nf.id) {
      NotatiAPI.downloadNoteFileById(nf.id, _buildNoteFilename(nf))
        .catch(e => toast.error('Download failed', e.message));
    } else if (note._numId) {
      NotatiAPI.downloadNoteFile(note._numId, note.fileName || note.title + '.pdf')
        .catch(e => toast.error('Download failed', e.message));
    }
  }

  function downloadAll() {
    if (files.length === 0) { toast.error('No files', 'No files are attached to this note yet.'); return; }
    files.forEach((nf, i) => {
      setTimeout(() => downloadFile(nf), i * 400);
    });
  }

  const isFreeNote = note.isFree || Number(note.price || 0) === 0;

  return (
    <Modal open={open} onClose={onClose} size="lg"
           title={note.chapterTitle || note.title}
           subtitle={`${note.college} · ${note.courseName}`}
           footer={<>
             <button className="btn btn-ghost" onClick={onClose}>Close</button>
             {files.length > 1
               ? <button className="btn btn-primary" onClick={downloadAll}>
                   <Icons.Download size={15}/> Download all ({files.length})
                 </button>
               : <button className="btn btn-primary" onClick={() => files[0] ? downloadFile(files[0]) : downloadAll()}>
                   <Icons.Download size={15}/> Download
                 </button>}
           </>}>

      {/* Note info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px',
                    background: 'var(--bg-2)', borderRadius: 'var(--r-5)',
                    padding: '14px 18px', marginBottom: 16 }}>
        {[
          ['Course',    note.courseName],
          ['College',   note.college],
          ['Chapter',   `Ch.${note.chapterNumber}: ${note.chapterTitle}`],
          ['Price',     isFreeNote ? 'Free' : `BD ${Number(note.price).toFixed(3)}`],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ font: 'var(--type-label)', fontSize: 10, color: 'var(--fg-3)',
                          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{label}</div>
            <div style={{ font: 'var(--type-body)', color: 'var(--fg-1)', fontWeight: 500 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Styled PDF preview */}
      <div className="pdfview">
        <div className="toolbar">
          <span style={{ fontWeight: 700, color: 'var(--notati-paper)' }}>{note.fileName || `${note.courseName} · Ch.${note.chapterNumber}`}</span>
        </div>
        <div className="page">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ font: 'var(--type-label)', letterSpacing: '.08em',
                           color: 'var(--fg-3)', textTransform: 'uppercase' }}>{note.courseName} · Ch.{note.chapterNumber}</span>
            <span style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 11, color: 'var(--fg-3)' }}>
              Notati · From the student, to the student
            </span>
          </div>
          <div style={{ height: 4, width: 60, background: 'var(--notati-amber)', borderRadius: 2, marginBottom: 20 }}></div>
          <h2 style={{ marginBottom: 16 }}>{note.chapterTitle || note.title}</h2>
          {note.description ? (
            <p style={{ font: 'var(--type-body)', color: 'var(--fg-2)', lineHeight: 1.75, margin: 0, fontSize: 14 }}>
              {note.description}
            </p>
          ) : (
            <p style={{ font: 'var(--type-body)', color: 'var(--fg-3)', lineHeight: 1.75, margin: 0, fontSize: 13, fontStyle: 'italic' }}>
              No description available.
            </p>
          )}
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ font: 'var(--type-label)', letterSpacing: '.08em', textTransform: 'uppercase',
                        color: 'var(--fg-3)', marginBottom: 8, fontSize: 10 }}>
            Files ({files.length})
          </div>
          {files.map((nf, i) => (
            <div key={nf.id || i} className="note-file-row">
              <FileTypeChip type="pdf"/>
              <span className="note-file-name">
                {nf.label || nf.filename || `File ${i + 1}`}
              </span>
              <div className="note-file-actions">
                <button className="btn btn-ghost btn-sm"
                        onClick={() => nf.id
                          ? NotatiAPI.previewNoteFileById(nf.id).catch(e => toast.error('Preview failed', e.message))
                          : NotatiAPI.previewNoteFile(note._numId).catch(e => toast.error('Preview failed', e.message))}>
                  Quick look <Icons.ArrowRight size={13}/>
                </button>
                <button className="btn btn-soft btn-sm" onClick={() => downloadFile(nf)}>
                  <Icons.Download size={13}/> Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ============================================================
   Landing Page — public-facing notes browser (no login required)
   Two-level: course grid → chapter list (mirrors NotesLibrary)
   ============================================================ */
function LandingPage({ onLogin, onSignup, darkMode, onThemeToggle }) {
  const { toast } = useToast();
  const [notes, setNotes]                   = useStateC([]);
  const [loading, setLoading]               = useStateC(true);
  const [loadSecs, setLoadSecs]             = useStateC(0);
  const [q, setQ]                           = useStateC('');
  const [college, setCollege]               = useStateC('all');
  const [selectedCourse, setSelectedCourse] = useStateC(null);
  const [priceFilter, setPriceFilter]       = useStateC('all');
  const [readingNote, setReadingNote]       = useStateC(null);

  useEffectC(() => {
    NotatiAPI.getNotes()
      .then(n => { setNotes(n); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffectC(() => {
    if (!loading) return;
    const t = setInterval(() => setLoadSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  function pickCollege(c) { setCollege(c); setSelectedCourse(null); setQ(''); }

  // Level 1: group notes into course cards
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

  // Level 2: chapters for selected course, with optional price filter
  const courseChapters = useMemoC(() => {
    if (!selectedCourse) return [];
    return notes
      .filter(n => {
        if (n.courseName !== selectedCourse) return false;
        if (priceFilter === 'free' && n.price && Number(n.price) > 0) return false;
        if (priceFilter === 'paid' && (!n.price || Number(n.price) === 0)) return false;
        return true;
      })
      .sort((a, b) => Number(a.chapterNumber) - Number(b.chapterNumber));
  }, [notes, selectedCourse, priceFilter]);

  function handleDownload(n) { _downloadNote(n, setReadingNote, toast); }
  function handleQuickLook(n) { _previewNote(n, setReadingNote, toast); }

  const freeCount = notes.filter(n => !n.price || Number(n.price) === 0).length;

  // College cards — unique colleges with course counts
  const collegeSummaries = useMemoC(() => {
    const map = {};
    notes.forEach(n => {
      if (!map[n.college]) map[n.college] = new Set();
      map[n.college].add(n.courseName);
    });
    return COLLEGES.filter(c => map[c]).map(c => ({ name: c, courseCount: map[c].size }));
  }, [notes]);

  /* ── Shared layout blocks ── */
  const Navbar = (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 32px', height: 60,
      borderBottom: '1px solid var(--border-1)',
      background: 'var(--bg-page)', position: 'sticky', top: 0, zIndex: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="ds/assets/notati-mark.svg" alt="Notati" style={{ height: 28 }}/>
        <span style={{ font: 'var(--type-h3)', color: 'var(--fg-1)' }}>Notati</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={onThemeToggle}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{ padding: '7px 10px' }}>
          {darkMode ? <Icons.Sun size={16}/> : <Icons.Moon size={16}/>}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onLogin}>Log in</button>
        <button className="btn btn-primary btn-sm" onClick={onSignup}>
          Create account <Icons.ArrowRight size={13}/>
        </button>
      </div>
    </nav>
  );

  /* ── Level 2: Chapter list ── */
  if (selectedCourse) {
    const allChapters  = notes.filter(n => n.courseName === selectedCourse);
    const courseCollege = allChapters[0]?.college || '';
    const chFree = allChapters.filter(n => !n.price || Number(n.price) === 0).length;
    const chPaid = allChapters.length - chFree;

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
        {Navbar}
        <div className="fade-in" style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 80px' }}>
          <div className="page-head">
            <div className="ttl">
              <h1>{selectedCourse}</h1>
              <p className="sub">
                {courseCollege} · {allChapters.length} chapter{allChapters.length !== 1 ? 's' : ''}
                {chFree > 0 && ` · ${chFree} free`}
                {chPaid > 0 && ` · ${chPaid} paid`}
              </p>
            </div>
            <div className="actions">
              <button className="btn btn-outline"
                      onClick={() => { setSelectedCourse(null); setQ(''); setPriceFilter('all'); }}>
                <Icons.ArrowLeft size={16}/> All courses
              </button>
            </div>
          </div>

          <section className="panel">
            <div className="panel-head" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div className="filters" style={{ margin: 0 }}>
                {[{ id: 'all', label: 'All' }, { id: 'free', label: 'Free' }, { id: 'paid', label: 'Paid' }].map(o => (
                  <button key={o.id}
                          className={`btn btn-sm ${priceFilter === o.id ? 'btn-primary' : 'btn-soft'}`}
                          onClick={() => setPriceFilter(o.id)}
                          style={{ borderRadius: 'var(--r-pill)' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {courseChapters.length === 0 ? (
                <EmptyState title="No chapters match" message="Try changing the filter."/>
              ) : courseChapters.map(n => {
                const isFree = !n.price || Number(n.price) === 0;
                return (
                  <div key={n.id} className="chapter-row">
                    <div className="chapter-bubble"
                         style={{ background: isFree ? 'var(--notati-sage)' : 'var(--bg-section)',
                                  color: isFree ? 'var(--notati-paper)' : 'var(--fg-3)' }}>
                      {n.chapterNumber}
                    </div>
                    <div className="chapter-row-meta">
                      <div style={{ font: 'var(--type-h3)', color: 'var(--fg-1)', marginBottom: 2 }}>
                        Ch.{n.chapterNumber}: {n.chapterTitle}
                      </div>
                      <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                        {n.title}
                      </div>
                    </div>
                    <div className="chapter-row-actions">
                      {isFree ? (
                        <>
                          <span style={{ background: 'var(--notati-sage)', color: 'var(--notati-paper)',
                                         font: 'var(--type-label)', fontSize: 10, padding: '3px 10px',
                                         borderRadius: 'var(--r-pill)' }}>FREE</span>
                          <button className="btn btn-ghost btn-sm" title="Download PDF"
                                  onClick={() => handleDownload(n)}>
                            <Icons.Download size={14}/>
                          </button>
                          <button className="btn btn-soft btn-sm" onClick={() => setReadingNote(n)}>
                            <Icons.Eye size={13}/> Preview
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="tag tag-bark" style={{ fontWeight: 700 }}>
                            BD {Number(n.price).toFixed(3)}
                          </span>
                          <button className="btn btn-ghost btn-sm" title="Preview the first pages"
                                  onClick={() => { if (!NotatiAPI.openSample(n)) toast.error('Preview blocked', 'Please allow pop-ups for this site, then try again.'); }}>
                            <Icons.Eye size={13}/> Sample
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={onSignup}>
                            <Icons.Lock size={12}/> Create account
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <NoteReader open={!!readingNote} note={readingNote} onClose={() => setReadingNote(null)}/>
      </div>
    );
  }

  /* ── Level 1: Course grid ── */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      {Navbar}

      {/* Hero */}
      <section style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px 52px', textAlign: 'center' }}>
        {!loading && freeCount > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20,
            background: 'var(--bg-section)', border: '1px solid var(--border-2)',
            borderRadius: 'var(--r-pill)', padding: '5px 14px'
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%',
                           background: 'var(--notati-sage)', display: 'inline-block' }}/>
            <span style={{ font: 'var(--type-label)', fontSize: 12, color: 'var(--fg-2)' }}>
              {freeCount} free chapter{freeCount !== 1 ? 's' : ''} available now
            </span>
          </div>
        )}
        <h1 className="display" style={{ marginBottom: 16, fontSize: 'clamp(28px, 5vw, 46px)', lineHeight: 1.1 }}>
          Your notes, organised.<br/>Browse before you sign up.
        </h1>
        <p style={{ font: 'var(--type-body)', color: 'var(--fg-2)', fontSize: 16, lineHeight: 1.7,
                    maxWidth: 460, margin: '0 auto 28px' }}>
          Free chapters are yours to read and download right now.
          Create an account to upload content and unlock paid chapters.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onSignup} style={{ padding: '10px 22px' }}>
            Create account <Icons.ArrowRight size={15}/>
          </button>
          <button className="btn btn-outline" onClick={onLogin} style={{ padding: '10px 22px' }}>
            Log in
          </button>
        </div>
      </section>

      {/* Course grid / College cards */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
        {college === 'all' && !q.trim() ? (

          /* ── Level 0: College cards ── */
          <section className="panel">
            <div className="panel-head" style={{ justifyContent: 'flex-end' }}>
              <div className="search-mini" style={{ minWidth: 260 }}>
                <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all courses…"/>
              </div>
            </div>
            <div className="panel-body">
              {loading ? (
                <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                  <div style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid var(--border-2)',
                                borderTopColor: 'var(--notati-amber)', borderRadius: '50%',
                                animation: 'spin 0.9s linear infinite', marginBottom: 20 }}/>
                  <div style={{ font: 'var(--type-body)', color: 'var(--fg-2)', marginBottom: 16 }}>
                    {loadSecs < 3  ? 'Loading courses…'
                   : loadSecs < 9  ? 'Waking the server up…'
                   : loadSecs < 17 ? 'Server is starting - almost there…'
                   :                 'Taking a bit longer than usual, hang tight…'}
                  </div>
                  <div style={{ width: 220, height: 3, background: 'var(--border-2)', borderRadius: 2, margin: '0 auto 16px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: 'var(--notati-amber)',
                      width: `${Math.min(88, Math.round(100 * (1 - Math.exp(-loadSecs / 12))))}%`,
                      transition: 'width 1s ease-out'
                    }}/>
                  </div>
                  {loadSecs >= 5 && (
                    <div style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', fontSize: 12, maxWidth: 280, margin: '0 auto' }}>
                      First visit after a quiet period takes ~20 seconds.
                    </div>
                  )}
                </div>
              ) : collegeSummaries.length === 0 ? (
                <EmptyState title="No courses yet" message="The library is empty - check back soon."/>
              ) : (
                <div className="grid-3 fade-in">
                  {collegeSummaries.map(({ name, courseCount }) => (
                    <div key={name} className="notecard" style={{ cursor: 'pointer' }}
                         onClick={() => pickCollege(name)}>
                      <div className="title" style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{name}</div>
                      <p style={{ font: 'var(--type-body)', color: 'var(--fg-2)', fontSize: 14, margin: 0 }}>
                        {courseCount} course{courseCount !== 1 ? 's' : ''} available
                      </p>
                      <div className="foot">
                        <span/>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                       color: 'var(--notati-walnut)', fontWeight: 700 }}>
                          Browse courses <Icons.ArrowRight size={13}/>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

        ) : (

          /* ── Level 1: Course grid ── */
          <>
            {college !== 'all' && (
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => pickCollege('all')}>
                  <Icons.ArrowLeft size={14}/> All colleges
                </button>
                <span style={{ font: 'var(--type-h3)', color: 'var(--fg-1)' }}>{college}</span>
              </div>
            )}
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
                {loading ? (
                  <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid var(--border-2)',
                                  borderTopColor: 'var(--notati-amber)', borderRadius: '50%',
                                  animation: 'spin 0.9s linear infinite', marginBottom: 20 }}/>
                    <div style={{ font: 'var(--type-body)', color: 'var(--fg-2)', marginBottom: 16 }}>
                      {loadSecs < 3  ? 'Loading courses…'
                     : loadSecs < 9  ? 'Waking the server up…'
                     : loadSecs < 17 ? 'Server is starting - almost there…'
                     :                 'Taking a bit longer than usual, hang tight…'}
                    </div>
                    <div style={{ width: 220, height: 3, background: 'var(--border-2)', borderRadius: 2, margin: '0 auto 16px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: 'var(--notati-amber)',
                        width: `${Math.min(88, Math.round(100 * (1 - Math.exp(-loadSecs / 12))))}%`,
                        transition: 'width 1s ease-out'
                      }}/>
                    </div>
                    {loadSecs >= 5 && (
                      <div style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', fontSize: 12, maxWidth: 280, margin: '0 auto' }}>
                        First visit after a quiet period takes ~20 seconds.
                      </div>
                    )}
                  </div>
                ) : courses.length === 0 ? (
                  <EmptyState title="No courses yet" message="The library is empty - check back soon."/>
                ) : (
                  <div className="grid-3 fade-in">
                    {courses.map(({ courseName, college: coll, notes: cNotes }) => {
                      const free = cNotes.filter(n => !n.price || Number(n.price) === 0).length;
                      const paid = cNotes.length - free;
                      return (
                        <div key={courseName} className="notecard" style={{ cursor: 'pointer' }}
                             onClick={() => setSelectedCourse(courseName)}>
                          <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 4 }}>{coll}</div>
                          <span className="course">{courseName}</span>
                          <div className="title">{cNotes.length} chapter{cNotes.length !== 1 ? 's' : ''} available</div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                            {free > 0 && (
                              <span style={{ background: 'var(--notati-sage)', color: 'var(--notati-paper)',
                                             font: 'var(--type-label)', fontSize: 10, padding: '3px 10px',
                                             borderRadius: 'var(--r-pill)' }}>{free} free</span>
                            )}
                            {paid > 0 && (
                              <span style={{ background: 'transparent', color: 'var(--fg-2)',
                                             border: '1px solid var(--border-1)',
                                             font: 'var(--type-label)', fontSize: 10, padding: '3px 10px',
                                             borderRadius: 'var(--r-pill)' }}>{paid} paid</span>
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
          </>

        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{ background: 'var(--notati-bark)', color: 'var(--notati-paper)', marginTop: 80 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 48px 36px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 48, marginBottom: 56 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <img src="ds/assets/notati-mark-on-dark.svg" style={{ width: 28, height: 28 }}/>
                <span style={{ fontFamily: "'Overlock', serif", fontWeight: 900, fontSize: 20, letterSpacing: '-.02em' }}>Notati</span>
              </div>
              <p style={{ color: 'rgba(251,247,243,.55)', fontSize: 14, lineHeight: 1.7, maxWidth: 260, marginBottom: 28 }}>
                A student-to-student notes marketplace for university students in Bahrain.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <a href={CONTACT.instagramUrl} target="_blank" rel="noopener noreferrer"
                   title="Instagram"
                   style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(251,247,243,.18)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--notati-paper)', textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                  </svg>
                </a>
                <a href={`https://wa.me/${CONTACT.whatsapp}?text=${WA_DEFAULT_MSG}`} target="_blank" rel="noopener noreferrer"
                   title="WhatsApp"
                   style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(251,247,243,.18)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--notati-paper)', textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.112.554 4.094 1.523 5.812L.057 23.428a.5.5 0 0 0 .515.572l5.787-1.438A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.808 9.808 0 0 1-5.034-1.388l-.36-.214-3.733.928.974-3.647-.235-.374A9.818 9.818 0 0 1 2.182 12C2.182 6.573 6.573 2.182 12 2.182S21.818 6.573 21.818 12 17.427 21.818 12 21.818z"/>
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
                            color: 'var(--notati-clay)', marginBottom: 20 }}>Platform</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Log in', action: onLogin },
                  { label: 'Create account', action: onSignup },
                ].map(({ label, action }) => (
                  <a key={label} href="#" onClick={(e) => { e.preventDefault(); action(); }}
                     style={{ color: 'rgba(251,247,243,.7)', textDecoration: 'none', fontSize: 14 }}
                     onMouseEnter={e => e.target.style.color = 'var(--notati-paper)'}
                     onMouseLeave={e => e.target.style.color = 'rgba(251,247,243,.7)'}>
                    {label}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
                            color: 'var(--notati-clay)', marginBottom: 20 }}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <a href={`mailto:${CONTACT.email}`}
                   style={{ color: 'rgba(251,247,243,.7)', textDecoration: 'none', fontSize: 14 }}
                   onMouseEnter={e => e.target.style.color = 'var(--notati-paper)'}
                   onMouseLeave={e => e.target.style.color = 'rgba(251,247,243,.7)'}>
                  {CONTACT.email}
                </a>
                <a href={`https://wa.me/${CONTACT.whatsapp}?text=${WA_DEFAULT_MSG}`} target="_blank" rel="noopener noreferrer"
                   style={{ color: 'rgba(251,247,243,.7)', textDecoration: 'none', fontSize: 14 }}
                   onMouseEnter={e => e.target.style.color = 'var(--notati-paper)'}
                   onMouseLeave={e => e.target.style.color = 'rgba(251,247,243,.7)'}>
                  {CONTACT.benefitpay}
                </a>
                <a href={CONTACT.instagramUrl} target="_blank" rel="noopener noreferrer"
                   style={{ color: 'rgba(251,247,243,.7)', textDecoration: 'none', fontSize: 14 }}
                   onMouseEnter={e => e.target.style.color = 'var(--notati-paper)'}
                   onMouseLeave={e => e.target.style.color = 'rgba(251,247,243,.7)'}>
                  @{CONTACT.instagram}
                </a>
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(251,247,243,.1)', paddingTop: 28,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ color: 'rgba(251,247,243,.35)', fontSize: 13 }}>© {new Date().getFullYear()} Notati. All rights reserved.</span>
            <span style={{ color: 'rgba(251,247,243,.35)', fontSize: 13 }}>Made for students</span>
          </div>
        </div>
      </footer>

      <NoteReader open={!!readingNote} note={readingNote} onClose={() => setReadingNote(null)}/>
    </div>
  );
}

/* ============================================================
   MyNotesPage — notes the student can actually access
   ============================================================ */
function MyNotesPage({ user, onOpenNote }) {
  const { toast } = useToast();
  const [notes,          setNotes]          = useStateC([]);
  const [loading,        setLoading]        = useStateC(true);
  const [selectedCourse, setSelectedCourse] = useStateC(null);
  const [q,              setQ]              = useStateC('');
  const [priceFilter,    setPriceFilter]    = useStateC('all');   // all | paid | free

  useEffectC(() => {
    NotatiAPI.getNotes()
      .then(n => { setNotes(n.filter(note => note.hasAccess)); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function matchesPrice(n) {
    if (priceFilter === 'paid') return n.price && Number(n.price) > 0;
    if (priceFilter === 'free') return !n.price || Number(n.price) === 0;
    return true;
  }

  // Group accessible notes into course folders (respecting the paid/free filter)
  const courses = useMemoC(() => {
    const map = {};
    notes.filter(matchesPrice).forEach(n => {
      if (!map[n.courseName]) map[n.courseName] = { courseName: n.courseName, college: n.college, notes: [] };
      map[n.courseName].notes.push(n);
    });
    Object.values(map).forEach(c => c.notes.sort((a, b) => Number(a.chapterNumber) - Number(b.chapterNumber)));
    const ql = q.trim().toLowerCase();
    return Object.values(map).filter(c =>
      !ql || c.courseName.toLowerCase().includes(ql) || c.college.toLowerCase().includes(ql)
    );
  }, [notes, q, priceFilter]);

  const courseChapters = useMemoC(() => {
    if (!selectedCourse) return [];
    return notes.filter(n => n.courseName === selectedCourse && matchesPrice(n))
                .sort((a, b) => Number(a.chapterNumber) - Number(b.chapterNumber));
  }, [notes, selectedCourse, priceFilter]);

  function download(n) { _downloadNote(n, onOpenNote, toast); }

  /* ---- Level 2: Chapter list ---- */
  if (selectedCourse) {
    const courseCollege = courseChapters[0]?.college || '';
    return (
      <div className="fade-in">
        <div className="page-head">
          <div className="ttl">
            <h1>{selectedCourse}</h1>
            <p className="sub">{courseCollege} · {courseChapters.length} chapter{courseChapters.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="btn btn-soft btn-sm" onClick={() => setSelectedCourse(null)}>
            <Icons.ArrowLeft size={14}/> All courses
          </button>
        </div>

        <section className="panel">
          <div className="panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {courseChapters.map(n => (
                <div key={n.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', background: 'var(--bg-card)',
                  borderRadius: 'var(--r-5)', border: '1px solid var(--border-2)', gap: 12
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--fg-1)', fontSize: 14, marginBottom: 2 }}>
                      Ch.{n.chapterNumber}: {n.chapterTitle || n.title}
                    </div>
                    <div style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)' }}>
                      {n.title}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-soft btn-sm" onClick={() => onOpenNote(n)}>
                      <Icons.Eye size={13}/> Read
                    </button>
                    {(n.files || []).length > 0 && (
                      <button className="btn btn-outline btn-sm" onClick={() => download(n)}>
                        <Icons.Download size={13}/> {(n.files || []).length > 1 ? 'Files' : 'PDF'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  /* ---- Level 1: Course folders ---- */
  return (
    <div>
      <div className="page-head">
        <div className="ttl">
          <h1>My Notes</h1>
          <p className="sub">Chapters you have access to, free and unlocked.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="search-mini" style={{ minWidth: 260 }}>
            <Icons.Search size={16} style={{ color: 'var(--fg-3)' }}/>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by course name…"/>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {[{ id: 'all', label: 'All' }, { id: 'paid', label: 'Paid' }, { id: 'free', label: 'Free' }].map(o => (
              <button key={o.id}
                      className={`btn btn-sm ${priceFilter === o.id ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setPriceFilter(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body">
          {loading ? <PageLoader rows={6} variant="cards"/> : courses.length === 0 ? (
            <EmptyState
              title="No notes yet"
              message={notes.length === 0
                ? "You don't have access to any notes yet. Browse the library and unlock chapters."
                : "No courses match your search."}/>
          ) : (
            <div className="grid-3 fade-in">
              {courses.map(({ courseName, college: coll, notes: cNotes }) => (
                <div key={courseName} className="notecard" style={{ cursor: 'pointer' }}
                     onClick={() => setSelectedCourse(courseName)}>
                  <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 4 }}>{coll}</div>
                  <span className="course">{courseName}</span>
                  <div className="title">{cNotes.length} chapter{cNotes.length !== 1 ? 's' : ''} unlocked</div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ background: 'var(--notati-sage)', color: 'var(--notati-paper)',
                                   font: 'var(--type-label)', fontSize: 10, padding: '3px 10px',
                                   borderRadius: 'var(--r-pill)' }}>
                      {cNotes.length} accessible
                    </span>
                  </div>
                  <div className="foot">
                    <span style={{ opacity: .5 }}>{fmtDate(cNotes[0].publishedAt)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                   color: 'var(--notati-walnut)', fontWeight: 700 }}>
                      Open <Icons.ArrowRight size={13}/>
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

Object.assign(window, { CustomerDashboard, UploadContent, MyUploads, NotesLibrary, NoteReader, NoteDetailsModal, BagDrawer, BagCheckoutModal, LandingPage, MyNotesPage });
