/* ============================================================
   Notati — Authentication views (Login + Signup)
   Calls NotatiAPI for real JWT-based auth.
   Calls props.onAuth(user) on success.
   ============================================================ */

const { useState: useStateA, useEffect: useEffectA } = React;

const FALLBACK_QUOTE = {
  text: 'Chapter 4 made sense in 8 minutes. Worth every minute of revision.',
  user_name: 'Mariam',
  course: 'MGMT 233',
  user_college: 'University of Bahrain',
};

function AuthShell({ children, switchTo, mode, onGuest, darkMode, onThemeToggle }) {
  const [quotes, setQuotes]   = useStateA([FALLBACK_QUOTE]);
  const [qIndex, setQIndex]   = useStateA(0);

  useEffectA(() => {
    NotatiAPI.getTestimonials().then(data => {
      if (data && data.length > 0) setQuotes(data);
    }).catch(() => {});
  }, []);

  useEffectA(() => {
    if (quotes.length <= 1) return;
    const t = setInterval(() => setQIndex(i => (i + 1) % quotes.length), 6000);
    return () => clearInterval(t);
  }, [quotes]);

  const q = quotes[qIndex];

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
          "{q.text}"
          <span className="by">
            — {q.user_name}{q.course ? `, ${q.course}` : ''}{q.user_college ? ` · ${q.user_college}` : ''}
          </span>
          {quotes.length > 1 && (
            <div className="quote-dots">
              {quotes.map((_, i) => (
                <span key={i} className={`qdot${i === qIndex ? ' qdot-active' : ''}`}
                      onClick={() => setQIndex(i)}/>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="auth-main">
        <button onClick={onThemeToggle}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{ position: 'absolute', top: 32, left: 40,
                         background: 'none', border: '1px solid var(--border-1)',
                         borderRadius: 'var(--r-pill)', padding: '6px 10px',
                         cursor: 'pointer', color: 'var(--fg-2)',
                         display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          {darkMode ? <Icons.Sun size={15}/> : <Icons.Moon size={15}/>}
          <span style={{ font: 'var(--type-label)', fontSize: 11, letterSpacing: '.06em' }}>
            {darkMode ? 'Light' : 'Dark'}
          </span>
        </button>
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
function LoginView({ onAuth, switchTo, onGuest, darkMode, onThemeToggle }) {
  const { toast } = useToast();
  const [email,    setEmail]    = useStateA('');
  const [password, setPassword] = useStateA('');
  const [err,      setErr]      = useStateA('');
  const [busy,     setBusy]     = useStateA(false);
  const [busySecs, setBusySecs] = useStateA(0);

  useEffectA(() => {
    if (!busy) { setBusySecs(0); return; }
    const t = setInterval(() => setBusySecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

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

  const showWait = busy && busySecs >= 3;
  const waitMsg  = busySecs < 9  ? 'Waking the server up…'
                 : busySecs < 17 ? 'Server is starting — almost there…'
                 :                 'Taking a bit longer than usual, hang tight…';

  return (
    <AuthShell mode="login" switchTo={switchTo} onGuest={onGuest} darkMode={darkMode} onThemeToggle={onThemeToggle}>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h2>Welcome back.</h2>
        <p className="sub">Pick up where you left off — your notes are waiting.</p>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" autoFocus
                 value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder="Example@gmail.com" required/>
        </div>
        <div className="field">
          <label htmlFor="pass">Password</label>
          <input id="pass" type="password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 placeholder="••••••••" required/>
          {err ? <div className="err">{err}</div> : null}
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); switchTo('forgot'); }}
               style={{ font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 13 }}>
              Forgot password?
            </a>
          </div>
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
          {!busy && <Icons.ArrowRight size={16}/>}
        </button>

        {showWait && (
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <div style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', marginBottom: 10 }}>
              {waitMsg}
            </div>
            <div style={{ width: '100%', height: 3, background: 'var(--border-2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'var(--notati-amber)',
                width: `${Math.min(88, Math.round(100 * (1 - Math.exp(-busySecs / 12))))}%`,
                transition: 'width 1s ease-out'
              }}/>
            </div>
            {busySecs >= 5 && (
              <div style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', fontSize: 12, marginTop: 8 }}>
                First visit after a quiet period takes ~20 seconds.
              </div>
            )}
          </div>
        )}

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

/* ---------- Code entry (shared by signup-verify and password reset) ---------- */
function CountdownResend({ secsLeft, onResend }) {
  return (
    <div style={{ marginTop: 14, textAlign: 'center', font: 'var(--type-caption)', fontStyle: 'normal', fontSize: 13, color: 'var(--fg-3)' }}>
      {secsLeft > 0
        ? <>Code expires in {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, '0')} · </>
        : <>Code expired. </>}
      <a href="#" onClick={(e) => { e.preventDefault(); onResend(); }}>Resend code</a>
    </div>
  );
}

/* ---------- Sign up (form → email verification) ---------- */
function SignupView({ onAuth, switchTo, onGuest, darkMode, onThemeToggle }) {
  const { toast } = useToast();
  const [step,     setStep]     = useStateA('form'); // 'form' | 'verify'
  const [name,     setName]     = useStateA('');
  const [email,    setEmail]    = useStateA('');
  const [phone,    setPhone]    = useStateA('');
  const [password, setPassword] = useStateA('');
  const [confirm,  setConfirm]  = useStateA('');
  const [code,     setCode]     = useStateA('');
  const [err,      setErr]      = useStateA('');
  const [busy,     setBusy]     = useStateA(false);
  const [secsLeft, setSecsLeft] = useStateA(0);

  useEffectA(() => {
    if (secsLeft <= 0) return;
    const t = setInterval(() => setSecsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secsLeft]);

  async function submitForm(e) {
    e.preventDefault();
    setErr('');
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      await NotatiAPI.register(name, email, password, phone);
      setStep('verify');
      setSecsLeft(300);
      toast.success('Check your email', `We sent a 6-digit code to ${email}.`);
    } catch (e2) {
      setErr(e2.message);
      toast.error("Couldn't create your account", e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const user = await NotatiAPI.verifyEmail(email, code.trim());
      toast.success('Welcome to Notati.', "You're verified and in.");
      setTimeout(() => onAuth(user), 250);
    } catch (e2) {
      setErr(e2.message);
      toast.error('Verification failed', e2.message);
      setBusy(false);
    }
  }

  async function resend() {
    setErr('');
    try {
      await NotatiAPI.resendCode(email);
      setSecsLeft(300);
      setCode('');
      toast.success('Code sent', `A new code is on its way to ${email}.`);
    } catch (e2) {
      toast.error('Could not resend', e2.message);
    }
  }

  return (
    <AuthShell mode="signup" switchTo={switchTo} onGuest={onGuest} darkMode={darkMode} onThemeToggle={onThemeToggle}>
      {step === 'verify' ? (
        <form className="auth-card" onSubmit={submitCode} noValidate>
          <h2>Verify your email.</h2>
          <p className="sub">Enter the 6-digit code we sent to <strong>{email}</strong>.</p>
          <div className="field">
            <label htmlFor="code">Verification code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
                   value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                   placeholder="123456"
                   style={{ letterSpacing: '0.4em', fontSize: 20, textAlign: 'center' }} required/>
            {err ? <div className="err">{err}</div> : null}
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || code.length < 6}>
            {busy ? 'Verifying…' : 'Verify & continue'}
            {!busy && <Icons.ArrowRight size={16}/>}
          </button>
          <CountdownResend secsLeft={secsLeft} onResend={resend}/>
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setStep('form'); setErr(''); }}>← Use a different email</a>
          </div>
        </form>
      ) : (
        <form className="auth-card" onSubmit={submitForm} noValidate>
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
                   placeholder="Example@gmail.com" required/>
          </div>
          <div className="field">
            <label htmlFor="phone">Phone number</label>
            <input id="phone" type="tel" autoComplete="tel"
                   value={phone} onChange={(e) => setPhone(e.target.value)}
                   placeholder="e.g. 3300 0000" required/>
          </div>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="pw">Password</label>
              <input id="pw" type="password" autoComplete="new-password"
                     value={password} onChange={(e) => setPassword(e.target.value)}
                     placeholder="At least 8 characters" required/>
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
      )}
    </AuthShell>
  );
}

/* ---------- Forgot / reset password (email → code + new password) ---------- */
function ForgotPasswordView({ onAuth, switchTo, onGuest, darkMode, onThemeToggle }) {
  const { toast } = useToast();
  const [step,     setStep]     = useStateA('email'); // 'email' | 'reset'
  const [email,    setEmail]    = useStateA('');
  const [code,     setCode]     = useStateA('');
  const [password, setPassword] = useStateA('');
  const [confirm,  setConfirm]  = useStateA('');
  const [err,      setErr]      = useStateA('');
  const [busy,     setBusy]     = useStateA(false);
  const [secsLeft, setSecsLeft] = useStateA(0);

  useEffectA(() => {
    if (secsLeft <= 0) return;
    const t = setInterval(() => setSecsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secsLeft]);

  async function sendCode(e) {
    if (e) e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await NotatiAPI.forgotPassword(email);
      setStep('reset');
      setSecsLeft(300);
      toast.success('Check your email', `If an account exists, a code was sent to ${email}.`);
    } catch (e2) {
      setErr(e2.message);
      toast.error('Could not send code', e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setErr('');
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      const user = await NotatiAPI.resetPassword(email, code.trim(), password);
      toast.success('Password updated', "You're signed in with your new password.");
      setTimeout(() => onAuth(user), 250);
    } catch (e2) {
      setErr(e2.message);
      toast.error('Reset failed', e2.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell mode="login" switchTo={switchTo} onGuest={onGuest} darkMode={darkMode} onThemeToggle={onThemeToggle}>
      {step === 'reset' ? (
        <form className="auth-card" onSubmit={submitReset} noValidate>
          <h2>Reset password.</h2>
          <p className="sub">Enter the code sent to <strong>{email}</strong> and your new password.</p>
          <div className="field">
            <label htmlFor="rcode">Verification code</label>
            <input id="rcode" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
                   value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                   placeholder="123456"
                   style={{ letterSpacing: '0.4em', fontSize: 20, textAlign: 'center' }} required/>
          </div>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="np">New password</label>
              <input id="np" type="password" autoComplete="new-password"
                     value={password} onChange={(e) => setPassword(e.target.value)}
                     placeholder="At least 8 characters" required/>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="np2">Confirm</label>
              <input id="np2" type="password" autoComplete="new-password"
                     value={confirm} onChange={(e) => setConfirm(e.target.value)}
                     placeholder="Repeat password" required/>
            </div>
          </div>
          {err ? <div className="err" style={{ marginTop: 8, marginBottom: 12 }}>{err}</div> : null}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || code.length < 6} style={{ marginTop: 8 }}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
          <CountdownResend secsLeft={secsLeft} onResend={() => sendCode()}/>
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); switchTo('login'); }}>← Back to sign in</a>
          </div>
        </form>
      ) : (
        <form className="auth-card" onSubmit={sendCode} noValidate>
          <h2>Forgot password?</h2>
          <p className="sub">Enter your email and we'll send you a code to reset it.</p>
          <div className="field">
            <label htmlFor="femail">Email</label>
            <input id="femail" type="email" autoComplete="email" autoFocus
                   value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="Example@gmail.com" required/>
            {err ? <div className="err">{err}</div> : null}
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset code'}
            {!busy && <Icons.ArrowRight size={16}/>}
          </button>
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); switchTo('login'); }}>← Back to sign in</a>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

Object.assign(window, { LoginView, SignupView, ForgotPasswordView });
