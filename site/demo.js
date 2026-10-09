/* Umbra, in action, on the website: Umbra's own look and markup, an inbox that's made up. It plays when the
   page around it says so (it's in view), and keeps still if motion is reduced. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const still = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [STAR, READ, LATER, DONE, MORE] = $("#acts").innerHTML.split("|");
  const TODAY = [
    { who: "Lena Park", ini: "LP", tint: "#7c8cf0", subj: "Thursday's review", snip: "Could we move it to 2? I'd like Sam there too, and the slides by Wednesday if you can.", when: "10:42 AM", unread: true, needs: true },
    { who: "Theo Marsh", ini: "TM", tint: "#59b49c", subj: "Apartment on Elm St.", snip: "The landlord can do a twelve-month lease if we sign by Monday. What do you think?", when: "9:15 AM", unread: true, needs: true },
    { who: "Aurora Air", ini: "A", subj: "Check-in is open: Boston to Lisbon", snip: "Flight AU 218 departs Friday at 7:40 AM. Your seat is 14A.", when: "8:03 AM", auto: true },
    { who: "Mira Okafor", ini: "MO", tint: "#e0a25c", subj: "Photos from Saturday", snip: "A few favorites from the hike. The one at the ridge is my new background.", when: "7:30 AM", unread: true, file: ["JPG", "ridge", "+5"] },
  ];
  const YESTERDAY = [
    { who: "Daniel Ruiz", ini: "DR", tint: "#c47fd6", subj: "Re: Garden plans", snip: "Tomatoes along the fence, herbs by the door. I'll bring the seedlings on Sunday.", when: "Oct 8" },
    { who: "Fieldnote", ini: "F", subj: "Your weekly summary", snip: "Three notebooks changed this week, and two are waiting for your review.", when: "Oct 8", auto: true },
    { who: "Ana Silva", ini: "AS", tint: "#5fa8d3", subj: "Book club: November", snip: "We picked the short one this time. See everyone on the 14th!", when: "Oct 8" },
  ];
  const TIDE = [
    { who: "Priya Nair", ini: "PN", tint: "#e57f8f", subj: "Lunch on Friday?", snip: "There's a new place by the river. Noon works for me.", when: "11:58 AM", unread: true },
    { who: "Sam Lee", ini: "SL", tint: "#6cc08a", subj: "Slides, round two", snip: "I tidied the charts on pages 4 to 6. Have a look when you can.", when: "11:20 AM", unread: true },
  ];
  const node = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const row = (r) => {
    const el = node(`<div class="qm-row${r.unread ? "" : " qm-read"}${r.auto ? " qm-auto" : ""}${r.needs ? " qm-needs" : ""}" role="link">
      <span class="qm-av${r.auto ? " qm-rav" : " qm-tint"}" aria-hidden="true">${esc(r.ini)}</span>
      <span class="qm-who"><span class="qm-name">${esc(r.who)}</span></span>
      <span class="qm-subj"><span class="qm-s1">${esc(r.subj)}</span><span class="qm-s2">${esc(r.snip)}</span></span>
      <span class="qm-marks">${r.file ? `<button type="button" class="qm-rowfile" tabindex="-1"><i class="qm-rfext">${r.file[0]}</i><span>${r.file[1]}</span><b>${r.file[2]}</b></button>` : ""}</span>
      <span class="qm-when">${esc(r.when)}</span>
      <span class="qm-rowacts">${[STAR, READ, LATER, DONE, MORE].map((i) => `<button type="button" class="qm-ib qm-s" tabindex="-1">${i}</button>`).join("")}</span>
    </div>`);
    if (r.tint) $(".qm-av", el).style.background = r.tint;
    const ext = $(".qm-rfext", el);
    if (ext) ext.style.setProperty("--ext", "#d9744e");
    return el;
  };
  const day = (t) => node(`<div class="qm-day">${t}</div>`);
  const rows = $("#rows"), tide = $("#tide"), letin = $("#letin"), view = $("#qm-view");
  let timers = [], playing = false;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  function draw() {
    rows.replaceChildren(day("Today"), ...TODAY.map(row), day("Yesterday"), ...YESTERDAY.map(row));
    tide.style.display = "";
    view.classList.remove("demo-fade");
  }
  function play() {
    timers.forEach(clearTimeout);
    timers = [];
    draw();
    if (still) return;
    const list = [...rows.querySelectorAll(".qm-row")];
    list.forEach((el, i) => { el.style.animationDelay = i * 55 + "ms"; el.classList.add("demo-in"); });
    // a look down the list, as a pointer would
    const hot = (el) => { rows.querySelectorAll(".qm-hot").forEach((x) => x.classList.remove("qm-hot")); if (el) el.classList.add("qm-hot"); };
    later(1800, () => hot(list[0]));
    later(2500, () => hot(list[1]));
    later(3200, () => hot(list[2]));
    // Done: the flight's email slides away, and the list closes up
    later(4300, () => { const b = list[2].querySelectorAll(".qm-ib")[3]; b.classList.add("demo-press"); });
    later(4450, () => { list[2].classList.add("demo-away"); hot(null); });
    later(4800, () => { list[2].style.height = list[2].offsetHeight + "px"; list[2].offsetHeight; list[2].classList.add("qm-gone"); });
    later(5300, () => list[2].remove());
    // the tide comes in: two waiting emails arrive at once, at the top
    later(6500, () => letin.classList.add("demo-press"));
    later(6650, () => {
      letin.classList.remove("demo-press");
      tide.style.display = "none";
      const first = rows.querySelector(".qm-row");
      for (const r of TIDE) { const el = row(r); el.classList.add("demo-in"); rows.insertBefore(el, first); }
    });
    later(8200, () => hot(rows.querySelectorAll(".qm-row")[0]));
    later(9400, () => hot(null));
    // and again, after a pause
    later(12500, () => view.classList.add("demo-fade"));
    later(13300, () => { if (playing) play(); });
  }
  draw();
  // the page around it says when it's in view (or it plays on its own when opened by itself)
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data || e.data.demo == null) return;
    if (e.data.demo && !playing) { playing = true; play(); }
    else if (!e.data.demo && playing) { playing = false; timers.forEach(clearTimeout); timers = []; draw(); }
  });
  if (window.parent === window) { playing = true; play(); }
})();
