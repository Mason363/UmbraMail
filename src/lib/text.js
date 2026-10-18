/* =================================================================== reading words (pure)
   Codes, promises, tone, links, trackers, templates. Nothing here touches the page. */

/* a sign-in or verification code in a subject or preview ("Your code is 482913", "G-123456 is your Google
   verification code"); "" when there's none. Order numbers, prices and years aren't codes. */
function findCode(s) {
  s = String(s || "");
  if (!/\b(code|passcode|pin|otp|one[- ]time|verif\w*|confirm\w*|sign[- ]?in|log[- ]?in|security|2fa|two[- ]factor|authenticat\w*)\b/i.test(s)) return "";
  const pats = [
    /\b(?:code|passcode|pin|otp)\b(?:\s+(?:is|was))?[\s:#-]*\b((?:[A-Z]{1,3}-)?\d{4,8})\b/i,
    /\b((?:[A-Z]{1,3}-)?\d{4,8})\b\s+(?:is|was)\s+your\b/i,
    /\b((?:[A-Z]{1,3}-)?\d{3}[ -]\d{3})\b(?=[^\d]*\b(?:code|verif|sign|log))/i,
    /\b(?:code|passcode|pin|otp)\b[^\d\n]{0,24}\b(\d{4,8})\b/i,
  ];
  for (const p of pats) {
    const m = p.exec(s);
    if (!m) continue;
    const code = m[1].replace(/\s/g, "");
    const digits = code.replace(/\D/g, "");
    if (/^(19|20)\d\d$/.test(digits) && digits.length === 4) continue; // a year
    if (/[$€£¥]\s*$/.test(s.slice(0, m.index + m[0].indexOf(m[1])))) continue; // a price
    return code;
  }
  return "";
}

/* ---- due dates in plain words, relative to when something was written */
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_WORDS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/* "by Friday", "tomorrow", "tonight", "next week", "by 5pm", "on Oct 12", "10/12", "end of day" → { t, allDay }
   (the end of that day when no time is said), or null */
function parseDue(s, base) {
  s = String(s || "").toLowerCase();
  const b = new Date(base || Date.now());
  const endOf = (d) => { const x = new Date(d); x.setHours(23, 59, 0, 0); return x; };
  const time = /\b(?:by|at|before)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(noon|midday)\b/.exec(s);
  const withTime = (d) => {
    if (!time) return { t: endOf(d).getTime(), allDay: true };
    const x = new Date(d);
    if (time[4]) x.setHours(12, 0, 0, 0);
    else { let h = Number(time[1]) % 12; if (time[3] === "pm") h += 12; x.setHours(h, Number(time[2] || 0), 0, 0); }
    return { t: x.getTime(), allDay: false };
  };
  const addDays = (n) => { const x = new Date(b); x.setDate(x.getDate() + n); return x; };
  if (/\b(tonight|end of (the )?day|eod|by today|later today|this evening|today)\b/.test(s)) return /\btonight|this evening\b/.test(s) && !time ? { t: (() => { const x = new Date(b); x.setHours(21, 0, 0, 0); return x.getTime(); })(), allDay: false } : withTime(b);
  if (/\b(tomorrow|tmrw|tmr)\b/.test(s)) return withTime(addDays(1));
  if (/\b(this weekend|over the weekend)\b/.test(s)) { const n = (6 - b.getDay() + 7) % 7 || 0; return withTime(addDays(n === 0 && b.getDay() === 6 ? 1 : n + 1)); }
  if (/\b(next week)\b/.test(s)) { const n = ((1 - b.getDay() + 7) % 7) || 7; return withTime(addDays(n + 4)); }
  if (/\b(end of (the )?week|eow|this week)\b/.test(s)) { const n = (5 - b.getDay() + 7) % 7; return withTime(addDays(n)); }
  const wd = new RegExp("\\b(?:(next)\\s+)?(" + WEEKDAYS.join("|") + "|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\b").exec(s);
  if (wd) {
    const key = wd[2].slice(0, 3);
    const target = WEEKDAYS.findIndex((w) => w.startsWith(key));
    let n = (target - b.getDay() + 7) % 7;
    if (n === 0) n = 7; // "Friday" said on a Friday means next Friday
    if (wd[1]) n += n < 7 ? 7 : 0;
    return withTime(addDays(n));
  }
  const md = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(s) || /\b(?:by|on|due|until|before)\s+(\d{1,2})\/(\d{1,2})\b/.exec(s);
  if (md) {
    const month = isNaN(Number(md[1])) ? MONTH_WORDS.indexOf(md[1].slice(0, 3)) : Number(md[1]) - 1;
    const day = Number(md[2]);
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      const x = new Date(b.getFullYear(), month, day);
      if (x.getTime() < b.getTime() - 86400000 * 30) x.setFullYear(x.getFullYear() + 1);
      return withTime(x);
    }
  }
  if (time) { const x = withTime(b); if (x.t < b.getTime()) return withTime(addDays(1)); return x; }
  return null;
}

/* ---- promises: what you said you'd do, in mail you wrote. Each is the sentence, to whom it was said, and
   when it's due if a time was named. Questions, hopes and conditions aren't promises. */
const PROMISE = /\b(i['’]ll|i will|i shall|i['’]m going to|i am going to|i can (?:get|send|have|do|share|look)|let me (?:get back|check|look|send|follow)|(?:^|\bwe\s+|\bwe['’]ll\s+)will (?:get back|send|share|follow up|circle back|look into)|^will (?:get back|send|share|follow up|circle back|look into)|we['’]ll (?:get back|send|share|follow up|circle back|look into)|i promise)\b/i;
const NOT_PROMISE = /\?\s*$|\b(maybe|might|perhaps|probably|possibly|hopefully|if (?:i|you|we)|i hope|i wish|i['’]ll (?:be|see|try|have to|need)|i will (?:be|see|try|have to|need)|i['’]ll let you know if|whether)\b/i;
function findPromises(textIn, sentAt) {
  const out = [];
  const lines = String(textIn || "").replace(/\r/g, "").split(/\n+/).filter((l) => !/^\s*>/.test(l));
  const sentences = lines.join(" \n ").split(/(?<=[.!?])\s+|\s\n\s/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const sRaw of sentences) {
    if (sRaw.length < 8 || sRaw.length > 260) continue;
    if (!PROMISE.test(sRaw) || NOT_PROMISE.test(sRaw)) continue;
    if (/^(thanks|thank you|best|cheers|regards|sincerely|sent from)\b/i.test(sRaw)) continue;
    const s = sRaw.replace(/^(?:and|also|ok(?:ay)?|sure|yes|yep|great|sounds good)[,!.]?\s+/i, "");
    out.push({ text: s.length > 140 ? s.slice(0, 137).replace(/\s+\S*$/, "") + "…" : s, due: parseDue(s, sentAt) });
  }
  return out.slice(0, 3);
}

/* ---- tone: words that read heated, said back as one plain reason ("all caps", "!!!") */
const HEAT = /\b(ridiculous|unacceptable|outrageous|furious|livid|idiot\w*|stupid|incompetent|pathetic|disgusting|absurd|wtf|how dare|never again|sick of|fed up|shut up|liar|insult\w*)\b/i;
const MILD_HEAT = /\b(worst|useless|lying)\b/i;
function toneOf(s) {
  s = String(s || "");
  const words = s.match(/\b[A-Z]{3,}\b/g) || [];
  const shouting = words.filter((w) => !/^(USA|UK|EU|ASAP|FYI|OK|PDF|URL|API|CEO|CTO|HTML|CSS|JSON|AM|PM|EST|EDT|PST|PDT|UTC|GMT|ETA|TBD|RSVP|NASA|FAQ|ID|SMS|AI|IT|HR|PR|QA|UI|UX|NYC|LA|SF|DC)$/.test(w));
  const why = [];
  if (shouting.length >= 3 && shouting.length / Math.max(1, (s.match(/\b\w+\b/g) || []).length) > 0.08) why.push("a lot of capitals");
  if (/[!?]{3,}|!{2,}/.test(s)) why.push("strong punctuation");
  const m = HEAT.exec(s), mild = MILD_HEAT.exec(s);
  if (m) why.push("“" + m[0] + "”");
  if (mild && (m || why.length)) why.push("“" + mild[0] + "”");
  return { heated: !!m || why.length >= 2, why };
}
const ATTACH_WORDS = /\b(attached|attaching|enclosed|i['’]ve attached|see the attach\w*|find attached|pfa|(?:the|an|my) attachment (?:is|has|with|below|here))\b/i;
const mentionsAttachment = (s) => ATTACH_WORDS.test(String(s || "").split(/\n\s*On .+wrote:\s*\n/)[0]);

/* ---- links: where one really goes. Gmail and other mail systems wrap links (to check them, or to count
   clicks); the real destination is unwrapped where it's written in the link, and the counter named where not. */
// (each by the address it sends a click through, its site and path: a plain link to salesforce.com, a HubSpot blog or a
// picture host isn't a counter)
const CLICK_COUNTERS = [
  [/^([\w-]+\.)*(list-manage\.com|mailchi\.mp|mcusercontent\.com)\//i, "Mailchimp"], [/^([\w-]+\.)*sendgrid\.net\//i, "SendGrid"],
  [/^([\w-]+\.)*(hubspotlinks\.com|hubspotemail\.net|hsforms\.com|hs-sites\.com)\/|^(t|track|links)\.hubspot\.com\//i, "HubSpot"],
  [/^([\w-]+\.)*(mandrillapp\.com|mailgun\.org|mailgun\.net)\/|^(email\.)?mg\.[\w-]+(\.[\w-]+)+\//i, "Mailgun"], [/^([\w-]+\.)*(klaviyo\.com|klclick\d*\.com)\/|^trk\.klclick/i, "Klaviyo"],
  [/^substack\.com\/redirect\/|^email\.substack\.com\//i, "Substack"], [/^([\w-]+\.)*(beehiiv\.com)\//i, "beehiiv"], [/^([\w-]+\.)*(convertkit\.com|ck\.page|convertkit-mail\d*\.com)\//i, "Kit"],
  [/^([\w-]+\.)*(sparkpostmail\.com|spgo\.io)\//i, "SparkPost"], [/^([\w-]+\.)*(awstrack\.me|amazonses\.com)\//i, "Amazon SES"], [/^([\w-]+\.)*(rs6\.net|constantcontact\.com)\//i, "Constant Contact"],
  [/^([\w-]+\.)*(mktoweb\.com|marketo\.com|mktossl\.com)\//i, "Marketo"], [/^([\w-]+\.)*(exacttarget\.com|exct\.net)\//i, "Salesforce"], [/^linkedin\.com\/comm\//i, "LinkedIn"],
  [/^(click|clicks|track|tracking|trk)\.[\w-]+(\.[\w-]+)+\/|^email\.[\w-]+(\.[\w-]+)+\/c\//i, "a click counter"],
];
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; } }
function realLink(href) {
  let u = String(href || "").trim(), via = "", opaque = false;
  for (let i = 0; i < 4; i++) {
    let url;
    try { url = new URL(u); } catch (e) { break; }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const p = url.searchParams;
    if (/(^|\.)google\.[a-z.]+$/.test(host) && url.pathname === "/url" && (p.get("q") || p.get("url"))) { u = p.get("q") || p.get("url"); continue; }
    if (/safelinks\.protection\.outlook\.com$/.test(host) && p.get("url")) { u = p.get("url"); continue; }
    if (/urldefense\.(com|proofpoint\.com)$/.test(host)) { const m = /__(https?:\/\/[^_]+)__/.exec(u); if (m) { u = m[1]; continue; } }
    if (/(^|\.)l\.facebook\.com$|(^|\.)l\.instagram\.com$/.test(host) && p.get("u")) { u = p.get("u"); continue; }
    if (/(^|\.)t\.co$/.test(host)) { via = via || "X"; break; }
    // a click counter: the destination it writes into its own address, or (written nowhere) the counter itself. Any other
    // site's ?url= is that site's business: the link goes to that site, and that's what's said
    const counter = CLICK_COUNTERS.find(([re]) => re.test(host + url.pathname));
    if (!counter) break;
    via = via || counter[1];
    let next = "";
    for (const key of ["url", "u", "target", "redirect", "redirect_url", "dest", "destination", "r", "link"]) {
      const v = p.get(key);
      if (v && /^https?:\/\//i.test(v) && hostOf(v) !== host) { next = v; break; }
    }
    if (!next) { opaque = true; break; }
    u = next;
  }
  const host = hostOf(u);
  // (for mail and phone links, who: "ann@x.com", "+1 555 0100")
  const who = (pre) => { let v = u.replace(pre, "").split("?")[0]; try { v = decodeURIComponent(v); } catch (e) { /* as written */ } return v.trim(); };
  return { url: u, host, via, opaque, mail: /^mailto:/i.test(u) ? who(/^mailto:/i) || "someone" : "", tel: /^tel:/i.test(u) ? who(/^tel:/i) || "a number" : "" };
}
/* the site a link's own words name ("paypal.com", "www.chase.com/login"), if they name one */
function textHost(s) {
  const m = /^\s*(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,24})(?:[/:?#]\S*)?\s*$/i.exec(String(s || ""));
  return m ? m[1].replace(/^www\./, "").toLowerCase() : "";
}
/* two hosts are the same site when one ends with the other's registrable part ("mail.chase.com", "chase.com").
   Where names are sold under a second level ("bank.co.uk", "shop.com.au"), that's three parts, not two:
   "evil.co.uk" isn't the same site as "bank.co.uk". */
const SOLD_UNDER = /^(co|com|net|org|gov|ac|edu|ne|or|go|ltd|plc|sch|nhs|mil|gob|gouv|nic|biz|info)$/;
const soldUnder = (p) => p.length >= 2 && p[p.length - 1].length === 2 && SOLD_UNDER.test(p[p.length - 2]);
function siteOf(host) {
  const p = String(host || "").toLowerCase().replace(/\.$/, "").split(".");
  if (p.length === 2 && soldUnder(p)) return ""; // "co.uk" itself is nobody's site
  return p.slice(soldUnder(p) ? -3 : -2).join(".");
}
function sameSite(a, b) {
  if (!a || !b) return true;
  a = a.toLowerCase(); b = b.toLowerCase();
  const under = (x, y) => x.endsWith("." + y) && !!siteOf(y); // (only under a whole site, never under "co.uk")
  return a === b || under(a, b) || under(b, a) || (!!siteOf(a) && siteOf(a) === siteOf(b));
}

/* ---- tracking pixels: a picture that's only there to tell the sender you opened their email */
const PIXEL_SERVICES = [
  [/list-manage\.com\/track\/open|mailchimp|mcusercontent\.com\/[^ ]*open/i, "Mailchimp"], [/sendgrid\.net\/wf\/open|ct\.sendgrid/i, "SendGrid"],
  [/hubspot|hubspotemail|t\.hubspot/i, "HubSpot"], [/mailgun|\/o\/[\w=-]{20,}/i, "Mailgun"], [/klaviyo|trk\.klclick/i, "Klaviyo"],
  [/substack\.com\/o\/|email\.substack/i, "Substack"], [/beehiiv/i, "beehiiv"], [/convertkit|open\.convertkit/i, "Kit"],
  [/sparkpost|spgo\.io/i, "SparkPost"], [/awstrack\.me|amazonses/i, "Amazon SES"], [/mixmax|mxmx/i, "Mixmax"], [/superhuman/i, "Superhuman"],
  [/mailtrack|mailsuite/i, "Mailtrack"], [/yesware/i, "Yesware"], [/streak\.com/i, "Streak"], [/getnotify|bananatag|readnotify/i, "a read tracker"],
  [/salesforce|exacttarget|pardot/i, "Salesforce"], [/marketo|mkto/i, "Marketo"], [/constantcontact|rs6\.net/i, "Constant Contact"], [/linkedin\.com\/emimp/i, "LinkedIn"],
  [/\/(open|opens|pixel|beacon|track|tracking|trk)(\.gif|\.png)?([/?#]|$)|[?&](open|pixel)=/i, "a tracker"],
];
// (a service's open-tracking address: /open, /track/open.php, /wf/open, /e2t/to/…, ?open=…)
const OPEN_PATH = /\/(open|opens|pixel|beacon|track|tracking|trk|e2t)(\.gif|\.png|\.php)?([/?#]|$)|\/wf\/open|[?&](open|pixel)=/i;
/* the original address behind Gmail's image proxy (googleusercontent.com/proxy/…#https://…) */
function unproxy(src) { const i = String(src || "").indexOf("#http"); return i > 0 ? src.slice(i + 1) : String(src || ""); }
/* which service a picture tells, or "" when it's a real picture. w, h: its size as written (0 when not) */
function trackerOf(src, w, h) {
  const real = unproxy(src);
  const tiny = (w > 0 && w <= 3 && !(h > 3)) || (h > 0 && h <= 3 && !(w > 3));
  const unsized = !(w > 0) && !(h > 0);
  const big = w > 40 || h > 40;
  const hit = PIXEL_SERVICES.find(([re]) => re.test(real));
  let path = real;
  try { path = new URL(real, "https://x.x").pathname; } catch (e) { /* an address that doesn't parse: as written */ }
  // a picture counts as a tracker when it's too small to see, or has no size and isn't an ordinary image file; a named
  // service's also when its address is the service's open-tracking one (its own logos, photos and banners are pictures)
  const image = /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(path);
  if (hit && !big && (tiny || (unsized && !image) || (hit[1] !== "a tracker" && OPEN_PATH.test(path)))) return hit[1];
  if (tiny && /^https?:/i.test(real) && !/\.svg(\?|$)/i.test(real)) return "a tracker";
  return "";
}

/* ---- templates: {first} {name} {me} {my first} {today} {tomorrow} {date}; unknown fields stay as written */
function fillTemplate(tpl, v) {
  v = v || {};
  const first = (s) => String(s || "").trim().split(/\s+/)[0] || "";
  const map = {
    first: first(v.name), name: v.name || "", me: v.me || "", "my first": first(v.me), "my name": v.me || "",
    today: v.today || "", tomorrow: v.tomorrow || "", date: v.today || "", company: v.company || "", subject: v.subject || "",
  };
  return String(tpl || "").replace(/\{\s*([a-z ]+?)\s*\}/gi, (m, k) => {
    const key = k.toLowerCase();
    if (!(key in map)) return m;
    return map[key];
  }).replace(/[ \t]+([,.!?])/g, (m, p, off, all) => (all[off - 1] === "\n" ? m : p)).replace(/ {2,}/g, " ");
}

/* ---- what kind of automated mail something is, when Gemini hasn't said: for the paper's sections */
const KINDS_OF_MAIL = [
  ["Orders", /\b(order|shipped|shipping|delivered|delivery|out for delivery|package|tracking number|receipt|invoice|payment|refund|your purchase)\b/i],
  ["Security", /\b(security alert|sign[- ]?in|new device|password|verification|verify|2-step|two-factor|suspicious)\b/i],
  ["Social", /\b(instagram|facebook|linkedin|twitter|x\.com|reddit|tiktok|threads|discord|snapchat|pinterest|youtube|mentioned you|tagged you|new follower)\b/i],
  ["Travel", /\b(flight|boarding|itinerary|reservation|booking|check-?in|hotel|airbnb|trip)\b/i],
  ["Events", /\b(invitation|invited|rsvp|event|webinar|calendar|reminder:|starts in|tomorrow at)\b/i],
  ["Promotions", /\b(\d+% off|sale|deal|discount|save \$?\d+|limited time|offer|coupon|promo|free shipping|black friday|new arrivals|shop now)\b/i],
  ["Newsletters", /\b(newsletter|digest|weekly|daily|edition|issue #?\d+|substack|beehiiv|roundup|this week in|briefing|bulletin)\b/i],
];
function kindOfMail(from, subject, snippet) {
  const s = [from, subject, snippet].join(" ");
  for (const [k, re] of KINDS_OF_MAIL) if (re.test(s)) return k;
  return "Updates";
}

/* ---- the Gemini notes sheet: which column is which, from its header row. `merged` is true when Google's
   query glued rows of data onto the header ("Thread ID 1a11b98c…"), which means the copy can't be trusted */
const SHEET_COLUMNS = { tid: "thread id", mid: "message id", rec: "received", from: "from", subj: "subject", sum: "summary", cat: "category", act: "action", due: "due", pri: "priority", rep: "reply needed", key: "key detail", rtext: "reply", rlabel: "reply label" };
function sheetColumns(row) {
  const head = (row || []).map((x) => String(x || "").trim().toLowerCase());
  const merged = head.some((x) => /^thread id\s+[0-9a-f]{8,}/.test(x));
  const find = (name) => { const i = head.indexOf(name); return i >= 0 ? i : head.findIndex((x) => x.replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim() === name); };
  const cols = {};
  for (const [k, name] of Object.entries(SHEET_COLUMNS)) cols[k] = find(name);
  return { cols, merged };
}

/* ---- search: the words a Gmail search looks for, and where they are in a line ---- */
// the words a search looks for (not its operators): from:, to:, subject: and filename: keep theirs
const FIND_OPS = /(^|\s)(-?)(from|to|cc|bcc|subject|label|in|is|has|filename|after|before|older|newer|older_than|newer_than|larger|smaller|size|category|list|deliveredto|rfc822msgid):("[^"]*"|\([^)]*\)|\S+)/gi;
function findTerms(q) {
  const terms = [];
  let rest = String(q || "").replace(FIND_OPS, (all, pre, neg, op, val) => {
    // ("from:me", "cc:me": you, not the word "me")
    if (!neg && /^(from|to|cc|bcc|subject|filename)$/i.test(op)) terms.push(...val.replace(/^["({]|[")}]$/g, "").split(/\s+/).filter((w) => !/^(from|to|cc|bcc)$/i.test(op) || !/^me$/i.test(w)));
    return " ";
  });
  rest = rest.replace(/(^|\s)-("[^"]*"|\S+)/g, " ").replace(/"([^"]+)"/g, (all, p) => { terms.push(p); return " "; });
  terms.push(...rest.split(/\s+/));
  // (Gmail's grouping words and brackets aren't words to find: "from:(ann OR bob)", "{bus train}")
  const clean = terms.map((t) => t.replace(/^[+*({\[]+|[*,;:!?.)}\]]+$/g, "").trim())
    .filter((t) => !/^(or|and|around(\s+\d+)?|\|)$/i.test(t) && (t.length >= 2 || /\d/.test(t) || CJK.test(t)));
  return [...new Set(clean.map((t) => t.toLowerCase()))].sort((a, b) => b.length - a.length);
}
// writing without spaces between words (Chinese, Japanese, Korean, Thai): a word is found anywhere, not only at a word's start
const CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
function findRe(q) {
  const terms = findTerms(q);
  if (!terms.length) return null;
  const one = (t) => (CJK.test(t) ? "" : "(?<![\\p{L}\\p{N}])") + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  try { return new RegExp("(" + terms.map(one).join("|") + ")", "giu"); }
  catch (e) { return null; }
}
/* the stretch of text around the first of your words */
function around(text, re) {
  if (!re || !text) return "";
  const flat = String(text).replace(/\s+/g, " ");
  re.lastIndex = 0;
  const m = re.exec(flat);
  re.lastIndex = 0;
  if (!m) return "";
  let a = Math.max(0, m.index - 60);
  if (a > 0) { const sp = flat.indexOf(" ", a); if (sp > -1 && sp < m.index) a = sp + 1; }
  let b = Math.min(flat.length, m.index + m[0].length + 170);
  if (b < flat.length) { const sp = flat.lastIndexOf(" ", b); if (sp > m.index + m[0].length) b = sp; }
  return (a > 0 ? "…" : "") + flat.slice(a, b).trim() + (b < flat.length ? "…" : "");
}
/* an email's own words, without the earlier messages it quotes ("> …" lines, and everything from "On … wrote:") */
function ownWords(text) {
  return String(text || "").split("\n").filter((l) => !/^\s*>/.test(l)).join("\n")
    .replace(/(^|\n)[^\n]{0,12}\bOn\s[^\n]{4,160}?\bwrote:[\s\S]*$/i, "$1")
    .replace(/(^|\n)-{4,}\s*Forwarded message\s*-{4,}[\s\S]*$/i, "$1").trim();
}

/* a link that asks for a new message (mailto:, or Gmail's full-page new message): who it's to, the subject and the
   words, and which account the link names. null when it isn't one, or names nothing to fill in.
   (No constants from outside: the bundle calls it before anything else is set up.) */
function composeLink(href) {
  const s = String(href || "").trim();
  const dec = (x) => { try { return decodeURIComponent(x); } catch (e) { return x; } };
  const list = (x) => String(x || "").split(/[,;]/).map((y) => y.trim().replace(/^mailto:/i, "").trim()).filter(Boolean);
  const d = { to: [], cc: [], bcc: [], subject: "", text: "", u: null, email: "" };
  // mailto:a@b.com,c@d.com?cc=…&bcc=…&subject=…&body=… (a + is a plus here, not a space)
  const mailto = (m) => {
    const q = m.indexOf("?");
    d.to.push(...list(dec(q < 0 ? m : m.slice(0, q))));
    for (const part of (q < 0 ? "" : m.slice(q + 1)).split("&")) {
      if (!part) continue;
      const i = part.indexOf("="), k = dec(i < 0 ? part : part.slice(0, i)).toLowerCase(), v = i < 0 ? "" : dec(part.slice(i + 1));
      if (k === "to" || k === "cc" || k === "bcc") d[k].push(...list(v));
      else if (k === "subject" && !d.subject) d.subject = v;
      else if (k === "body" && !d.text) d.text = v;
    }
  };
  if (/^mailto:/i.test(s)) mailto(s.slice(7));
  else {
    let u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.hostname !== "mail.google.com" || !/^\/mail(\/|$)/.test(u.pathname)) return null;
    const q = u.searchParams;
    if (!(q.get("view") === "cm" || q.get("tf") === "cm" || q.get("extsrc") === "mailto")) return null;
    if (q.has("draft") || q.has("th") || q.has("compose")) return null; // (a draft or a reply of Gmail's own: as it is)
    for (const k of ["to", "cc", "bcc"]) d[k].push(...list(q.get(k)));
    d.subject = q.get("su") || q.get("subject") || "";
    d.text = q.get("body") || "";
    const m = /^mailto:(.*)$/i.exec(q.get("url") || "");
    if (m) mailto(m[1]);
    const n = (u.pathname.match(/^\/mail\/u\/(\d+)/) || [])[1], who = q.get("authuser") || "";
    d.u = n != null ? Number(n) : /^\d+$/.test(who) ? Number(who) : null;
    d.email = /@/.test(who) ? who.toLowerCase() : "";
  }
  for (const k of ["to", "cc", "bcc"]) d[k] = [...new Set(d[k])];
  d.text = d.text.replace(/\r\n?/g, "\n");
  return d.to.length || d.cc.length || d.bcc.length || d.subject || d.text ? d : null;
}
