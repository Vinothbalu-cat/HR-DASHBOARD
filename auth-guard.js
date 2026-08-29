/* ============================================================================
   TBH People Console — auth guard + idle auto-logout
   Loaded by index.html as: <script type="module" src="auth-guard.js"></script>

   What it does
     1. Blocks the dashboard until Firebase confirms a signed-in user.
        No user  → straight back to login.html
     2. Fills the header chip with the signed-in email.
     3. Wires the "Sign out" button.
     4. Signs the user out after 10 minutes of INACTIVITY, with a 60-second
        warning they can dismiss. Activity in any open tab counts.

   To change the timing, edit the two constants below.
   To make it an ABSOLUTE 10 minutes (logs out even while someone is working),
   set ABSOLUTE_TIMEOUT to true.
   ========================================================================== */

const IDLE_MINUTES     = 10;      // minutes before automatic sign-out
const WARN_SECONDS     = 60;      // warning shown this long before it happens
const ABSOLUTE_TIMEOUT = false;   // false = idle timer (resets on activity)

const firebaseConfig = {
  apiKey: "AIzaSyAnBRk_EzjEkXGN6Yeh7HrJa-6iNNZb0-g",
  authDomain: "hr-dashboard-ad102.firebaseapp.com",
  projectId: "hr-dashboard-ad102",
  storageBucket: "hr-dashboard-ad102.firebasestorage.app",
  messagingSenderId: "494269148327",
  appId: "1:494269148327:web:562d56ff66064e25ae7f82"
};

const IDLE_MS  = IDLE_MINUTES * 60 * 1000;
const WARN_MS  = WARN_SECONDS * 1000;
const LS_SEEN  = "tbh_console_last_activity";   // shared across tabs
const LS_START = "tbh_console_session_start";   // used by ABSOLUTE_TIMEOUT

const reveal = () => document.documentElement.classList.remove("auth-pending");
const $ = id => document.getElementById(id);

/* ---------------------------------------------------------------- styles */
const css = document.createElement("style");
css.textContent = `
#idleOverlay{position:fixed;inset:0;z-index:300;display:none;align-items:center;justify-content:center;
  background:rgba(20,20,22,.55);backdrop-filter:blur(3px);padding:24px}
#idleOverlay.on{display:flex}
#idleBox{background:#fff;border-radius:14px;max-width:400px;width:100%;padding:26px 26px 22px;
  box-shadow:0 18px 50px rgba(0,0,0,.3);font-family:Inter,system-ui,sans-serif;color:#1E1E1E;text-align:center}
#idleBox h3{margin:0 0 8px;font-size:17px;font-weight:700;letter-spacing:-.02em}
#idleBox p{margin:0;font-size:13.5px;color:#6E6E73;line-height:1.55}
#idleCount{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:700;color:#C8102E}
#idleBtns{display:flex;gap:9px;justify-content:center;margin-top:20px}
#idleBox button{border-radius:8px;padding:10px 18px;font:600 13px Inter,sans-serif;cursor:pointer;border:1px solid #E4E4E8;background:#fff;color:#3D3D3D}
#idleBox button:hover{border-color:#96969C}
#idleStay{background:#C8102E;border-color:#C8102E;color:#fff}
#idleStay:hover{background:#9B0C23;border-color:#9B0C23}`;
document.head.appendChild(css);

const overlay = document.createElement("div");
overlay.id = "idleOverlay";
overlay.innerHTML = `<div id="idleBox" role="alertdialog" aria-modal="true" aria-labelledby="idleTitle">
  <h3 id="idleTitle">Still there?</h3>
  <p>For security you will be signed out in <span id="idleCount">60</span> seconds.</p>
  <div id="idleBtns">
    <button type="button" id="idleOut">Sign out now</button>
    <button type="button" id="idleStay">Stay signed in</button>
  </div></div>`;
let mounted = false;
function mountOverlay() {
  if (mounted) return;
  if (!document.body) { document.addEventListener("DOMContentLoaded", mountOverlay); return; }
  document.body.appendChild(overlay);
  overlay.querySelector("#idleStay").onclick = () => { lastWrite = 0; markActivity(); hideWarning(); };
  overlay.querySelector("#idleOut").onclick  = () => leave("signedout");
  mounted = true;
}

/* ---------------------------------------------------------------- firebase */
let auth = null, signOutFn = null;
let tick = null, warned = false, lastWrite = 0;

try {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const { getAuth, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence }
    = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");

  auth = getAuth(initializeApp(firebaseConfig));
  signOutFn = () => signOut(auth);
  try { await setPersistence(auth, browserLocalPersistence); } catch (e) { /* private browsing */ }

  onAuthStateChanged(auth, user => {
    if (!user) { location.replace("login.html"); return; }
    reveal();
    paintUser(user);
    startTimer();
  });
} catch (e) {
  /* Firebase unreachable — do not brick the page. Show it, say so, no timer. */
  console.warn("[auth-guard] Firebase could not load:", e);
  reveal();
  const chip = $("userChip");
  if (chip) { chip.hidden = false; $("userAv").textContent = "!"; $("userMail").textContent = "Offline — not verified"; }
}

/* ---------------------------------------------------------------- user chip */
function paintUser(user) {
  const mail = user.email || "Signed in";
  const chip = $("userChip");
  if (chip) {
    chip.hidden = false;
    chip.title = mail;
    $("userAv").textContent = mail.charAt(0);
    $("userMail").textContent = mail;
  }
  const btn = $("btnLogout");
  if (btn) btn.onclick = () => leave("signedout");
}

async function leave(reason) {
  stopTimer();
  try { if (signOutFn) await signOutFn(); } catch (e) { /* fall through to redirect */ }
  try { localStorage.removeItem(LS_SEEN); localStorage.removeItem(LS_START); } catch (e) {}
  location.replace("login.html?" + reason + "=1");
}

/* ---------------------------------------------------------------- idle timer */
const now = () => Date.now();
function readSeen() {
  try { return parseInt(localStorage.getItem(LS_SEEN) || "0", 10) || 0; } catch (e) { return 0; }
}
const PASSIVE_EV = { mousemove: 1, scroll: 1, wheel: 1 };
function markActivity(e) {
  /* Once the countdown is on screen, a stray mouse drift should not silently
     cancel it — require a deliberate click, key press or tap. */
  if (warned && e && PASSIVE_EV[e.type]) return;
  const t = now();
  if (t - lastWrite < 1000) return;          // throttle: at most one write a second
  lastWrite = t;
  try { localStorage.setItem(LS_SEEN, String(t)); } catch (e) {}
  if (warned) hideWarning();                 // any real activity dismisses the warning
}

function startTimer() {
  markActivity();
  try { if (!localStorage.getItem(LS_START)) localStorage.setItem(LS_START, String(now())); } catch (e) {}

  ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel", "focus"]
    .forEach(ev => window.addEventListener(ev, markActivity, { passive: true, capture: true }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) markActivity(); });

  mountOverlay();

  stopTimer();
  tick = setInterval(check, 1000);
  check();
}
function stopTimer() { if (tick) { clearInterval(tick); tick = null; } }

function check() {
  let elapsed;
  if (ABSOLUTE_TIMEOUT) {
    let start = 0;
    try { start = parseInt(localStorage.getItem(LS_START) || "0", 10) || now(); } catch (e) { start = now(); }
    elapsed = now() - start;
  } else {
    elapsed = now() - (readSeen() || now());
  }
  const left = IDLE_MS - elapsed;

  if (left <= 0) { leave("timeout"); return; }
  if (left <= WARN_MS) { showWarning(Math.ceil(left / 1000)); }
  else if (warned)     { hideWarning(); }
}

function showWarning(secs) {
  warned = true;
  mountOverlay();
  overlay.classList.add("on");
  const c = overlay.querySelector("#idleCount");
  if (c) c.textContent = secs;
}
function hideWarning() {
  warned = false;
  overlay.classList.remove("on");
}

/* Signing out in one tab signs out the rest: Firebase broadcasts the state
   change, and onAuthStateChanged above redirects every open tab. */
