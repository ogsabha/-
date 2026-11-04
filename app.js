import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

/* ---------------------------------------------------------------
   1. PASTE YOUR FIREBASE CONFIG HERE (Firebase console > Project
      settings > Your apps > Web app). Until you do, the site still
      shows the menu and timetable, but ratings/status/wall are off.
---------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "PASTE_HERE",
  authDomain: "PASTE_HERE",
  projectId: "PASTE_HERE",
  storageBucket: "PASTE_HERE",
  messagingSenderId: "PASTE_HERE",
  appId: "PASTE_HERE"
};

// Add more words you want blocked on the wall (lowercase).
const BAD_WORDS = ["idiot", "stupid", "slut", "bitch"];

/* --------------------------------------------------------------- */

const ready = !firebaseConfig.apiKey.startsWith("PASTE");
let db, auth;
if (ready) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} else {
  document.getElementById("setup-note").hidden = false;
}

/* ---------- small helpers ---------- */
const $ = (id) => document.getElementById(id);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n) => String(n).padStart(2, "0");
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const todayName = () => DAYS[new Date().getDay()];
const fmt12 = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
};
const store = {
  get(k, fallback = null) { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
};
const deviceId = (() => {
  let id = store.get("deviceId");
  if (!id) { id = crypto.randomUUID(); store.set("deviceId", id); }
  return id;
})();

// Builds DOM safely. Text is always set as text, never as HTML.
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}

let currentUser = null;

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === btn.dataset.tab));
  });
});

/* =================================================================
   FOOD
================================================================= */
let menu = null;
let ratingStats = {}; // meal -> { sum, count } for today

async function initFood() {
  menu = await (await fetch("data/menu.json")).json();
  const sel = $("day-select");
  DAYS.forEach((d) => sel.append(el("option", { value: d, text: d })));
  sel.value = todayName();
  sel.addEventListener("change", renderFood);
  renderFood();

  if (ready) {
    onSnapshot(query(collection(db, "ratings"), where("date", "==", todayStr())), (snap) => {
      ratingStats = {};
      snap.forEach((d) => {
        const r = d.data();
        const s = (ratingStats[r.meal] ||= { sum: 0, count: 0 });
        s.sum += r.stars;
        s.count += 1;
      });
      renderFood();
    });
  }
  setInterval(renderFood, 60000);
}

function renderFood() {
  if (!menu) return;
  const day = $("day-select").value;
  const isToday = day === todayName();
  const nm = nowMin();
  const list = $("food-list");
  list.replaceChildren();

  menu.meals.forEach((m) => {
    const live = isToday && nm >= toMin(m.start) && nm < toMin(m.end);
    const card = el("div", { class: "card" + (live ? " live" : "") },
      el("div", { class: "row" },
        el("h3", { text: m.name }),
        live ? el("span", { class: "badge", text: "Serving now" }) : null
      ),
      el("p", { class: "muted", text: `${fmt12(m.start)} – ${fmt12(m.end)}` }),
      el("p", { text: (menu.days[day] || {})[m.name] || "Not added yet" })
    );

    if (isToday && ready) {
      const stats = ratingStats[m.name];
      const avg = stats ? (stats.sum / stats.count).toFixed(1) : null;
      card.append(el("p", { class: "muted", text: stats ? `★ ${avg} (${stats.count} ratings today)` : "No ratings yet today" }));

      if (nm >= toMin(m.start)) {
        const mine = Number(store.get(`rated_${todayStr()}_${m.name}`, 0));
        const stars = el("div", { class: "stars" });
        for (let i = 1; i <= 5; i++) {
          stars.append(el("button", {
            class: i <= mine ? "on" : "",
            "aria-label": `${i} star${i > 1 ? "s" : ""}`,
            text: "★",
            onclick: () => rate(m.name, i)
          }));
        }
        card.append(stars);
      } else {
        card.append(el("p", { class: "muted", text: "Rating opens when the meal starts." }));
      }
    }
    list.append(card);
  });
}

async function rate(meal, stars) {
  const date = todayStr();
  try {
    // One document per device per meal per day, so rating again just replaces your old rating.
    await setDoc(doc(db, "ratings", `${date}_${meal}_${deviceId}`), { date, meal, stars });
    store.set(`rated_${date}_${meal}`, stars);
    renderFood();
  } catch (e) {
    console.error(e);
    alert("Could not save your rating. Try again.");
  }
}

/* =================================================================
   CLASSES
================================================================= */
let tt = null;
let attendance = {}; // "Class A_3" -> true/false for today

async function initClasses() {
  tt = await (await fetch("data/timetable.json")).json();
  const sel = $("class-select");
  Object.keys(tt.classes).forEach((c) => sel.append(el("option", { value: c, text: c })));
  const saved = store.get("myClass");
  if (saved && tt.classes[saved]) sel.value = saved;
  sel.addEventListener("change", () => { store.set("myClass", sel.value); renderClasses(); });
  renderClasses();

  if (ready) {
    onSnapshot(query(collection(db, "attendance"), where("date", "==", todayStr())), (snap) => {
      attendance = {};
      snap.forEach((d) => { const a = d.data(); attendance[`${a.cls}_${a.period}`] = a.present; });
      renderClasses();
    });
  }
  setInterval(renderClasses, 30000);
}

function statusBadge(cls, period) {
  const v = attendance[`${cls}_${period}`];
  if (v === true) return el("span", { class: "badge good", text: "Teacher present" });
  if (v === false) return el("span", { class: "badge bad", text: "Teacher absent" });
  return el("span", { class: "badge grey", text: "Not reported yet" });
}

function renderClasses() {
  if (!tt) return;
  const cls = $("class-select").value;
  const slots = (tt.classes[cls] || {})[todayName()] || [];
  const periodOf = (no) => tt.periods.find((p) => p.no === no);
  const nm = nowMin();

  const current = slots.find((s) => { const p = periodOf(s.period); return p && nm >= toMin(p.start) && nm < toMin(p.end); });
  const next = slots.find((s) => { const p = periodOf(s.period); return p && toMin(p.start) > nm; });

  const nowBox = $("class-now");
  nowBox.replaceChildren();
  if (current) {
    const p = periodOf(current.period);
    nowBox.append(el("div", { class: "card live" },
      el("div", { class: "row" }, el("h3", { text: "Now" }), ready ? statusBadge(cls, current.period) : null),
      el("p", { text: `Period ${current.period} · ${current.subject}` }),
      el("p", { class: "muted", text: `${current.teacher} · ${fmt12(p.start)} – ${fmt12(p.end)}` })
    ));
  } else {
    nowBox.append(el("div", { class: "card" },
      el("h3", { text: "No class right now" }),
      next
        ? el("p", { class: "muted", text: `Next: ${next.subject} with ${next.teacher} at ${fmt12(periodOf(next.period).start)}` })
        : el("p", { class: "muted", text: slots.length ? "No more classes today." : "No classes today." })
    ));
  }

  const table = $("class-table");
  table.replaceChildren();
  if (!slots.length) return;

  const tbl = el("table");
  slots.forEach((s) => {
    const p = periodOf(s.period);
    const isCurrent = s === current;
    const cell = el("td", {},
      el("strong", { text: s.subject }),
      el("div", { class: "muted", text: s.teacher })
    );
    if (ready) {
      cell.append(statusBadge(cls, s.period));
      if (currentUser) {
        cell.append(el("div", { class: "actions" },
          el("button", { text: "Mark present", onclick: () => setAttendance(cls, s.period, true) }),
          el("button", { class: "danger", text: "Mark absent", onclick: () => setAttendance(cls, s.period, false) }),
          el("button", { class: "ghost", text: "Clear", onclick: () => clearAttendance(cls, s.period) })
        ));
      }
    }
    tbl.append(el("tr", { class: isCurrent ? "current" : "" },
      el("td", { class: "muted", text: p ? `P${s.period} · ${fmt12(p.start)}` : `P${s.period}` }),
      cell
    ));
  });
  table.append(tbl);
}

async function setAttendance(cls, period, present) {
  const date = todayStr();
  try {
    await setDoc(doc(db, "attendance", `${date}_${cls}_${period}`), { date, cls, period, present });
  } catch (e) {
    console.error(e);
    alert("You are not allowed to change this. Log in with a class rep account.");
  }
}
async function clearAttendance(cls, period) {
  try { await deleteDoc(doc(db, "attendance", `${todayStr()}_${cls}_${period}`)); }
  catch (e) { console.error(e); alert("Could not clear."); }
}

/* =================================================================
   WALL (anonymous posts)
================================================================= */
let approvedPosts = [];
let pendingPosts = [];
let unsubPending = null;
const reportedKey = "reportedPosts";
const reportedSet = () => new Set(JSON.parse(store.get(reportedKey, "[]")));

function initWall() {
  const text = $("post-text");
  text.addEventListener("input", () => { $("post-count").textContent = `${text.value.length} / 300`; });

  $("post-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("post-msg");
    const body = text.value.trim();
    if (!ready) { msg.textContent = "The wall is not connected yet."; return; }
    if (!body) return;

    const last = Number(store.get("lastPost", 0));
    if (Date.now() - last < 60000) { msg.textContent = "Please wait a minute between posts."; return; }
    const lower = body.toLowerCase();
    if (BAD_WORDS.some((w) => lower.includes(w))) { msg.textContent = "Please remove rude words and try again."; return; }

    try {
      await addDoc(collection(db, "posts"), { text: body, approved: false, reports: 0, createdAt: serverTimestamp() });
      store.set("lastPost", Date.now());
      text.value = "";
      $("post-count").textContent = "0 / 300";
      msg.textContent = "Thanks! Your post will appear after it is approved.";
    } catch (err) {
      console.error(err);
      msg.textContent = "Could not post. Try again later.";
    }
  });

  if (ready) {
    onSnapshot(query(collection(db, "posts"), where("approved", "==", true)), (snap) => {
      approvedPosts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderWall();
    });
  } else {
    $("post-list").append(el("p", { class: "muted", text: "Posts will show here once Firebase is connected." }));
  }
}

function subscribePending() {
  if (unsubPending) { unsubPending(); unsubPending = null; }
  pendingPosts = [];
  if (ready && currentUser) {
    unsubPending = onSnapshot(
      query(collection(db, "posts"), where("approved", "==", false)),
      (snap) => { pendingPosts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderWall(); },
      (err) => console.warn("Not allowed to read pending posts:", err.code)
    );
  }
  renderWall();
}

function postTime(p) {
  const s = p.createdAt?.seconds;
  return s ? new Date(s * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "just now";
}

function renderWall() {
  if (!ready) return;
  const staff = !!currentUser;
  const reported = reportedSet();

  // Students hide posts that got 3+ reports. Staff still see them with the count.
  const visible = approvedPosts
    .filter((p) => staff || (p.reports || 0) < 3)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const list = $("post-list");
  list.replaceChildren();
  if (!visible.length) list.append(el("p", { class: "muted", text: "No posts yet. Be the first." }));
  visible.forEach((p) => {
    const actions = el("div", { class: "actions" });
    actions.append(el("button", {
      class: "ghost",
      text: reported.has(p.id) ? "Reported" : "Report",
      disabled: reported.has(p.id) ? "" : null,
      onclick: () => reportPost(p.id)
    }));
    if (staff) actions.append(el("button", { class: "danger", text: `Delete (${p.reports || 0} reports)`, onclick: () => removePost(p.id) }));
    list.append(el("div", { class: "card" },
      el("p", { text: p.text }),
      el("p", { class: "muted", text: postTime(p) }),
      actions
    ));
  });

  const box = $("pending-box");
  box.hidden = !staff;
  const pl = $("pending-list");
  pl.replaceChildren();
  if (staff) {
    if (!pendingPosts.length) pl.append(el("p", { class: "muted", text: "Nothing waiting." }));
    pendingPosts
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
      .forEach((p) => {
        pl.append(el("div", { class: "card" },
          el("p", { text: p.text }),
          el("div", { class: "actions" },
            el("button", { text: "Approve", onclick: () => approvePost(p.id) }),
            el("button", { class: "danger", text: "Delete", onclick: () => removePost(p.id) })
          )
        ));
      });
  }
}

async function reportPost(id) {
  try {
    await updateDoc(doc(db, "posts", id), { reports: increment(1) });
    const set = reportedSet(); set.add(id);
    store.set(reportedKey, JSON.stringify([...set]));
    renderWall();
  } catch (e) { console.error(e); alert("Could not report."); }
}
async function approvePost(id) {
  try { await updateDoc(doc(db, "posts", id), { approved: true }); }
  catch (e) { console.error(e); alert("Not allowed."); }
}
async function removePost(id) {
  if (!confirm("Delete this post?")) return;
  try { await deleteDoc(doc(db, "posts", id)); }
  catch (e) { console.error(e); alert("Not allowed."); }
}

/* =================================================================
   STAFF LOGIN
================================================================= */
function renderAuth() {
  const box = $("auth-status");
  box.replaceChildren();
  $("login-form").hidden = !!currentUser;
  if (currentUser) {
    box.append(
      el("span", { text: `Logged in as ${currentUser.email} ` }),
      el("button", { class: "ghost", text: "Log out", onclick: () => signOut(auth) })
    );
  }
}

if (ready) {
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, $("login-email").value, $("login-pass").value);
      $("login-pass").value = "";
    } catch (err) {
      console.error(err);
      alert("Wrong email or password.");
    }
  });
  onAuthStateChanged(auth, (u) => {
    currentUser = u;
    renderAuth();
    renderClasses();
    subscribePending();
  });
} else {
  $("login-form").hidden = true;
}

/* ---------- start ---------- */
initFood();
initClasses();
initWall();
