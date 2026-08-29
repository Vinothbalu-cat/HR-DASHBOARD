/* ============================================================
   TBH People Console — auth guard
   Add ONE line inside <head> of index.html:
     <script type="module" src="auth-guard.js"></script>
   It hides the page until Firebase confirms a signed-in user,
   and adds a "Sign out" button into the hero action row.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ---- Same config as login.html ---- */
const firebaseConfig = {
  apiKey: "AIzaSyAnBRk_EzjEkXGN6Yeh7HrJa-6iNNZb0-g",
  authDomain: "hr-dashboard-ad102.firebaseapp.com",
  projectId: "hr-dashboard-ad102",
  storageBucket: "hr-dashboard-ad102.firebasestorage.app",
  messagingSenderId: "494269148327",
  appId: "1:494269148327:web:562d56ff66064e25ae7f82"
};


// blank the page until auth resolves, so data never flashes to a logged-out visitor
const veil = document.createElement('style');
veil.textContent = 'body{visibility:hidden}';
document.head.appendChild(veil);

const auth = getAuth(initializeApp(firebaseConfig));

onAuthStateChanged(auth, user => {
  if (!user) { location.replace('login.html'); return; }
  veil.remove();

  const row = document.querySelector('.hero-actions');
  if (!row) return;

  const who = document.createElement('span');
  who.style.cssText = 'font-size:11.5px;color:#A99180;margin-right:4px';
  who.textContent = user.email;

  const out = document.createElement('button');
  out.className = 'btn';
  out.textContent = '⏻ Sign out';
  out.onclick = () => signOut(auth).then(() => location.replace('login.html'));

  row.prepend(who);
  row.appendChild(out);
});
