import { useState, FormEvent } from "react";
import { Authenticated, Unauthenticated, AuthLoading, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { Shop } from "./Shop";

export default function App() {
  return (
    <>
      <AuthLoading>
        <div className="center"><span className="spin" /> Loading…</div>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <Bootstrap />
      </Authenticated>
    </>
  );
}

function Bootstrap() {
  const me = useQuery(api.users.me);
  const ensure = useMutation(api.users.ensureProfile);
  const [tried, setTried] = useState(false);
  if (me === undefined) return <div className="center"><span className="spin" /> Loading…</div>;
  if (me === null) {
    if (!tried) { setTried(true); ensure({}).catch(() => {}); }
    return <div className="center"><span className="spin" /> Setting up your account…</div>;
  }
  return <Shop me={me} />;
}

function SignIn() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const fd = new FormData(e.currentTarget);
    fd.set("flow", mode);
    try {
      await signIn("password", fd);
    } catch {
      setErr(mode === "signUp" ? "Could not sign up — that email may already exist." : "Invalid email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate-wrap">
      <form className="gate" onSubmit={onSubmit}>
        <div className="mark">⚙</div>
        <h2>Geek Next Door</h2>
        <p>Work orders · Inventory · Invoices</p>
        <div className="tabs">
          <button type="button" className={mode === "signIn" ? "on" : ""} onClick={() => setMode("signIn")}>Sign In</button>
          <button type="button" className={mode === "signUp" ? "on" : ""} onClick={() => setMode("signUp")}>Sign Up</button>
        </div>
        {mode === "signUp" && <div className="fg"><label>Full Name</label><input name="name" /></div>}
        <div className="fg"><label>Email</label><input name="email" type="email" autoComplete="email" required /></div>
        <div className="fg"><label>Password</label><input name="password" type="password" autoComplete="current-password" required /></div>
        <button className="btn primary full" type="submit" disabled={busy}>
          {busy ? <span className="spin" /> : mode === "signUp" ? "Create Account" : "Sign In"}
        </button>
        {err && <div className="msg err">{err}</div>}
        <div className="hint">The first account becomes admin. Others join as technicians; an admin sets roles.</div>
      </form>
    </div>
  );
}
