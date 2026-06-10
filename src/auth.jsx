/* ============================================================
   Notati — Authentication views (Login + Signup)
   Calls NotatiAPI for real JWT-based auth.
   Calls props.onAuth(user) on success.
   ============================================================ */

const { useState: useStateA } = React;

function AuthShell({ children, switchTo, mode, onGuest }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <a className="logo-row" href="#" onClick={(e) => e.preventDefault()}>
          <img src="ds/assets/notati-mark-on-dark.svg" alt="Notati"/>
          <span className="name">Notati</span>
        </a>

        <div className="pitch">
          <div className="amber-line"></div>
          <h1>From the student, to the student.</h1>
          <p>
            Dense chapters turned into clear, scannable notes — written by students
            who actually sat the exam. Submit your slides, get back something you will
            actually read at 2am.
          </p>
        </div>

        <div className="quote">
          "Chapter 4 made sense in 8 minutes. Worth every minute of revision."
          <span className="by">— Mariam, MGMT 233 · University of Bahrain</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="switch">
          {mode === 'login'
            ? <>New here? <a href="#" onClick={(e) => { e.preventDefault(); switchTo('signup'); }}>Create an account</a></>
            : <>Already a member? <a href="#" onClick={(e) => { e.preventDefault(); switchTo('login'); }}>Sign in</a></>}
        </div>
        {children}
      </main>
    </div>
  );
}

/* ---------- Login ---------- */
function LoginView({ onAuth, switchTo, onGuest }) {
  const { toast } = useToast();
  const [email,    setEmail]    = useStateA('');
  const [password, setPassword] = useStateA('');
  const [err,      setErr]      = useStateA('');
  const [busy,     setBusy]     = useStateA(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const user = await NotatiAPI.login(email, password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}.`, 'Loading your dashboard...');
      setTimeout(() => onAuth(user), 250);
    } catch (e2) {
      if (e2.message.includes('Cannot reach server')) {
        setErr('Server is starting up — retrying in 15 seconds...');
        setTimeout(() => submit(e), 15000);
      } else {
        setErr(e2.message);
        toast.error('Could not sign in', e2.message);
        setBusy(false);
      }
    }
  }

  return (
    <AuthShell mode="login" switchTo={switchTo} onGuest={onGuest}>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h2>Welcome back.</h2>
        <p className="sub">Pick up where you left off — your notes are waiting.</p>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" autoFocus
                 value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder="you@uob.edu.bh" required/>
        </div>
        <div className="field">
          <label htmlFor="pass">Password</label>
          <input id="pass" type="password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 placeholder="••••••••" required/>
          {err ? <div className="err">{err}</div> : null}
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
          {!busy && <Icons.ArrowRight size={16}/>}
        </button>

        {onGuest && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-1)' }}/>
              <span style={{ font: 'var(--type-label)', fontSize: 11, color: 'var(--fg-3)' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-1)' }}/>
            </div>
            <button type="button" className="btn btn-outline btn-block" onClick={onGuest}>
              Browse free notes as guest
            </button>
          </>
        )}
      </form>
    </AuthShell>
  );
}

/* ---------- Sign up ---------- */
function SignupView({ onAuth, switchTo, onGuest }) {
  const { toast } = useToast();
  const [name,     setName]     = useStateA('');
  const [email,    setEmail]    = useStateA('');
  const [password, setPassword] = useStateA('');
  const [confirm,  setConfirm]  = useStateA('');
  const [err,      setErr]      = useStateA('');
  const [busy,     setBusy]     = useStateA(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    if (password !== confirm) { setErr("Passwords don't match."); setBusy(false); return; }
    try {
      const user = await NotatiAPI.register(name, email, password);
      toast.success('Welcome to Notati.', "You're in. Upload your first file whenever you're ready.");
      setTimeout(() => onAuth(user), 300);
    } catch (e2) {
      if (e2.message.includes('Cannot reach server')) {
        setErr('Server is starting up — retrying in 15 seconds...');
        setTimeout(() => submit(e), 15000);
      } else {
        setErr(e2.message);
        toast.error("Couldn't create your account", e2.message);
        setBusy(false);
      }
    }
  }

  return (
    <AuthShell mode="signup" switchTo={switchTo} onGuest={onGuest}>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h2>Join Notati.</h2>
        <p className="sub">Get clear, student-written notes — and contribute your own.</p>

        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" autoFocus value={name}
                 onChange={(e) => setName(e.target.value)}
                 placeholder="Mariam Al-Khalifa" required/>
        </div>
        <div className="field">
          <label htmlFor="email2">Email</label>
          <input id="email2" type="email" autoComplete="email"
                 value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder="you@uob.edu.bh" required/>
        </div>
        <div className="field-row">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete="new-password"
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   placeholder="At least 6 characters" required/>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pw2">Confirm</label>
            <input id="pw2" type="password" autoComplete="new-password"
                   value={confirm} onChange={(e) => setConfirm(e.target.value)}
                   placeholder="Repeat password" required/>
          </div>
        </div>
        {err ? <div className="err" style={{ marginTop: 8, marginBottom: 12 }}>{err}</div> : null}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
          {busy ? 'Creating your account...' : 'Create account'}
          {!busy && <Icons.ArrowRight size={16}/>}
        </button>

        {onGuest && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-1)' }}/>
              <span style={{ font: 'var(--type-label)', fontSize: 11, color: 'var(--fg-3)' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-1)' }}/>
            </div>
            <button type="button" className="btn btn-outline btn-block" onClick={onGuest}>
              Browse free notes as guest
            </button>
          </>
        )}

        <p style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 12, color: 'var(--fg-3)', marginTop: 14 }}>
          By signing up you agree to our friendly terms — be kind, share fairly, no plagiarism.
        </p>
      </form>
    </AuthShell>
  );
}

Object.assign(window, { LoginView, SignupView });
