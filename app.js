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
  apiKey: "AIzaSyDAom6PmaYuSN75PrsVRSGzCHHrvbF8Q8c",
  authDomain: "og-sabha.firebaseapp.com",
  projectId: "og-sabha",
  storageBucket: "og-sabha.firebasestorage.app",
  messagingSenderId: "692594007498",
  appId: "1:692594007498:web:819205fd17a8add28c8333"
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

// Looks in data/ first, then the main folder, so it works wherever the JSON files were uploaded.
async function loadJSON(name) {
  for (const path of [`data/${name}`, name]) {
    try { const r = await fetch(path); if (r.ok) return await r.json(); } catch { /* try next */ }
  }
  throw new Error(`Could not load ${name}`);
}
function showLoadError(err) {
  console.error(err);
  const n = $("setup-note");
  n.hidden = false;
  n.textContent = "Could not load the menu or timetable file. Check that the JSON files are uploaded and have no typos.";
}

// The "right now" strip under the header: current meal + current class.
function renderNow() {
  const box = $("now-strip");
  if (!box || !menu || !tt) return;
  const nm = nowMin(), today = todayName();
  const meal = menu.meals.find((m) => nm >= toMin(m.start) && nm < toMin(m.end));
  const nextMeal = menu.meals.find((m) => toMin(m.start) > nm);
  const mealText = meal ? (menu.days[today] || {})[meal.name]
    : nextMeal ? `${nextMeal.name} at ${fmt12(nextMeal.start)}` : "See tomorrow's menu in the Food tab";
  const slots = (tt.classes[$("class-select").value] || {})[today] || [];
  const per = (no) => tt.periods.find((p) => p.no === no);
  const cur = slots.find((s) => { const p = per(s.period); return p && nm >= toMin(p.start) && nm < toMin(p.end); });
  const nxt = slots.find((s) => { const p = per(s.period); return p && toMin(p.start) > nm; });
  const classTitle = cur ? cur.subject : nxt ? `Next: ${nxt.subject}` : "No more classes today";
  const classSub = cur ? cur.teacher : nxt ? `${fmt12(per(nxt.period).start)} · ${nxt.teacher}` : "";
  box.replaceChildren(
    el("div", {}, el("span", { class: "k", text: "🍽️ In the mess" }),
      el("strong", { text: meal ? `${meal.name} is being served` : "Nothing being served" }),
      el("span", { class: "muted", text: mealText })),
    el("div", {}, el("span", { class: "k", text: "📚 In class" }),
      el("strong", { text: classTitle }),
      el("span", { class: "muted", text: classSub }))
  );
}

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === btn.dataset.tab));
    document.body.dataset.theme = btn.dataset.tab; // switches the whole look
    const subs = {
      food: "Today's menu, what's being served now, and how it actually tastes.",
      classes: "Stay on top of your day: who is teaching, and where.",
      wall: "Say what you can't say out loud. Anonymous, always kind."
    };
    const sub = document.querySelector(".sub");
    if (sub) sub.textContent = subs[btn.dataset.tab];
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", { food: "#FFF0C2", classes: "#DDD6FF", wall: "#130F1E" }[btn.dataset.tab]);
    const r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, TAB_EMOJI[btn.dataset.tab], 8);
  });
});

/* =================================================================
   FOOD
================================================================= */
let menu = null;
let ratingStats = {}; // meal -> { sum, count } for today

async function initFood() {
  menu = await loadJSON("menu.json");
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
        el("h3", { text: `${MEAL_EMOJI[m.name] || "🍽️"} ${m.name}` }),
        live ? el("span", { class: "badge pulse", text: "Serving now" }) : null
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
            onclick: (e) => { burst(e.clientX, e.clientY, ["⭐", "✨", "🎉"], 12); rate(m.name, i); }
          }));
        }
        card.append(stars);
      } else {
        card.append(el("p", { class: "muted", text: "Rating opens when the meal starts." }));
      }
    }
    list.append(card);
  });
  renderNow();
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
  tt = await loadJSON("timetable.json");
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

  renderNow();
  const nowBox = $("class-now");
  nowBox.replaceChildren();
  if (current) {
    const p = periodOf(current.period);
    const startM = toMin(p.start), endM = toMin(p.end);
    const pct = Math.round(((nm - startM) / (endM - startM)) * 100);
    nowBox.append(el("div", { class: "card live" },
      el("div", { class: "row" }, el("h3", { text: "🔴 Now" }), ready ? statusBadge(cls, current.period) : null),
      el("p", { text: `Period ${current.period} · ${current.subject}` }),
      el("p", { class: "muted", text: `${current.teacher} · ${fmt12(p.start)} – ${fmt12(p.end)} · ${endM - nm} min left` }),
      el("div", { class: "bar", "aria-hidden": "true" }, el("i", { style: `--w:${pct}%` }))
    ));
  } else {
    nowBox.append(el("div", { class: "card" },
      el("h3", { text: "😴 No class right now" }),
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
      burst(innerWidth / 2, innerHeight / 2, ["💌", "✨", "🤫"], 14);
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
    list.append(el("div", { class: `card post c${noteColor(p.id)}` },
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
initFood().catch(showLoadError);
initClasses().catch(showLoadError);
initWall();

/* ---------- interactive hero ---------- */
const hero = $("hero");
const lines = { food: "eat up.", classes: "show up.", wall: "speak up." };
document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => {
    const h = $("h1-line");
    h.textContent = lines[b.dataset.tab];
    h.classList.remove("pop"); void h.offsetWidth; h.classList.add("pop");
  }));

// Time-of-day greeting chip.
(() => {
  const h = new Date().getHours();
  const hi = h < 5 ? "late night? 🦉" : h < 12 ? "good morning ☀️" : h < 17 ? "good afternoon 🌤️" : h < 21 ? "good evening 🌆" : "night owl 🌙";
  $("greet").textContent = `${hi} · ${todayName()}`;
})();

// Blobs drift and the headline's 3D shadow swings away from your finger or mouse.
if (hero && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  window.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    hero.style.setProperty("--px", (px - 0.5).toFixed(3));
    hero.style.setProperty("--py", (py - 0.5).toFixed(3));
    hero.style.setProperty("--sx", ((0.5 - px) * 6).toFixed(2));
    hero.style.setProperty("--sy", (3 + (0.5 - py) * 4).toFixed(2));
  });
}

/* ---------- draggable stickers ---------- */
document.querySelectorAll(".sticker").forEach((s) => {
  let sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
  s.addEventListener("pointerdown", (e) => {
    s.setPointerCapture(e.pointerId);
    sx = e.clientX; sy = e.clientY; moved = false;
    s.dataset.dragging = "1";
  });
  s.addEventListener("pointermove", (e) => {
    if (!s.dataset.dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    s.style.transform = `translate(${ox + dx}px, ${oy + dy}px)`;
  });
  const end = (e) => {
    if (!s.dataset.dragging) return;
    delete s.dataset.dragging;
    ox += e.clientX - sx; oy += e.clientY - sy;
    if (!moved) {
      s.classList.remove("spin"); void s.offsetWidth; s.classList.add("spin");
      burst(e.clientX, e.clientY, ["✨", "⭐", "💫"], 10);
    }
  };
  s.addEventListener("pointerup", end);
  s.addEventListener("pointercancel", end);
});

/* ---------- emoji bursts (clicks, ratings, posting) ---------- */
const MEAL_EMOJI = { Breakfast: "🍳", Lunch: "🍛", Snacks: "🍟", Dinner: "🌙" };
const TAB_EMOJI = { food: ["🍛", "🍟", "🧁"], classes: ["📚", "✏️", "💡"], wall: ["💬", "🤫", "🌙"] };

function burst(x, y, emojis, n = 10) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span");
    p.className = "burst";
    p.textContent = emojis[i % emojis.length];
    p.style.left = `${x}px`; p.style.top = `${y}px`;
    document.body.append(p);
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
    p.animate([
      { transform: "translate(-50%,-50%) scale(.4)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 30}px)) scale(1.1) rotate(${Math.random() * 120 - 60}deg)`, opacity: 0 }
    ], { duration: 650 + Math.random() * 400, easing: "cubic-bezier(.2,.8,.3,1)" }).onfinish = () => p.remove();
  }
}

// Each wall post gets a stable sticky-note colour from its id.
function noteColor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 4;
}
