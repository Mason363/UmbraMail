/* Umbra on the website: its own look and markup, still, with an inbox that's made up (no one's real mail) */
(() => {
  "use strict";
  const rows = document.getElementById("rows");
  const TODAY = [
    { who: "Lena Park", ini: "LP", tint: "#7c8cf0", subj: "Thursday's review", snip: "Could we move it to 2? I'd like Sam there too, and the slides by Wednesday if you can.", when: "2:47 PM", unread: true },
    { who: "Theo Marsh", ini: "TM", tint: "#59b49c", subj: "Apartment on Elm St.", snip: "The landlord can do a twelve-month lease if we sign by Monday. What do you think?", when: "2:43 PM", unread: true },
    { who: "Aurora Air", ini: "A", subj: "Check-in is open: Boston to Lisbon", snip: "Flight AU 218 departs Friday at 7:40 AM. Your seat is 14A.", when: "1:49 PM", auto: true },
    { who: "Mira Okafor", ini: "MO", tint: "#e0a25c", subj: "Photos from Saturday", snip: "A few favorites from the hike. The one at the ridge is my new background.", when: "12:47 PM" },
    { who: "Fieldnote", ini: "F", subj: "Your weekly summary", snip: "Three notebooks changed this week, and two are waiting for your review.", when: "10:13 AM", auto: true },
    { who: "Priya Nair", ini: "PN", tint: "#e57f8f", subj: "Lunch on Friday?", snip: "There's a new place by the river. Noon works for me.", when: "9:52 AM" },
    { who: "Sam Lee", ini: "SL", tint: "#6cc08a", subj: "Slides, round two", snip: "I tidied the charts on pages 4 to 6. Have a look when you can.", when: "9:12 AM" },
  ];
  const YESTERDAY = [
    { who: "Daniel Ruiz", ini: "DR", tint: "#c47fd6", subj: "Re: Garden plans", snip: "Tomatoes along the fence, herbs by the door. I'll bring the seedlings on Sunday.", when: "Oct 8" },
    { who: "Ana Silva", ini: "AS", tint: "#5fa8d3", subj: "Book club: November", snip: "We picked the short one this time. See everyone on the 14th!", when: "Oct 8" },
  ];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const row = (r) => {
    const x = el("div", "qm-row" + (r.unread ? "" : " qm-read") + (r.auto ? " qm-auto" : ""));
    const av = el("span", "qm-av" + (r.auto ? " qm-rav" : " qm-tint"), r.ini);
    if (r.tint) av.style.background = r.tint;
    const who = el("span", "qm-who"); who.append(el("span", "qm-name", r.who));
    const subj = el("span", "qm-subj"); subj.append(el("span", "qm-s1", r.subj), el("span", "qm-s2", r.snip));
    x.append(av, who, subj, el("span", "qm-marks"), el("span", "qm-when", r.when));
    return x;
  };
  rows.append(el("div", "qm-day", "Today"), ...TODAY.map(row), el("div", "qm-day", "Yesterday"), ...YESTERDAY.map(row));
})();
