import { test } from "node:test";
import assert from "node:assert/strict";
import { lib, local } from "./_lib.mjs";
const L = lib();

test("sign-in codes", () => {
  assert.equal(L.findCode("Your verification code is 482913"), "482913");
  assert.equal(L.findCode("G-123456 is your Google verification code."), "G-123456");
  assert.equal(L.findCode("482913 is your Instagram code"), "482913");
  assert.equal(L.findCode("Your Microsoft account security code: 7731"), "7731");
  assert.equal(L.findCode("Use code 551 902 to sign in"), "551902");
  assert.equal(L.findCode("Sign-in code for Slack — 4Q2"), "");
  assert.equal(L.findCode("Your order #8823412 has shipped"), "");
  assert.equal(L.findCode("Save $2024 this weekend"), "");
  assert.equal(L.findCode("Meeting moved to 2026"), "");
  assert.equal(L.findCode("Your code 2026 summer sale"), "");
  assert.equal(L.findCode("Confirm your email: your PIN is 0042"), "0042");
});

test("due dates in words", () => {
  const wed = local(2026, 10, 7, 14); // a Wednesday afternoon
  const day = (r) => r && new Date(r.t);
  assert.equal(day(L.parseDue("I'll send it tomorrow", wed)).getDate(), 8);
  assert.equal(day(L.parseDue("by Friday", wed)).getDate(), 9);
  assert.equal(day(L.parseDue("on Wednesday", wed)).getDate(), 14, "a weekday said on that weekday is next week's");
  assert.equal(day(L.parseDue("next friday", wed)).getDate(), 16);
  assert.equal(day(L.parseDue("by end of day", wed)).getDate(), 7);
  const five = L.parseDue("I'll get it to you by 5pm", wed);
  assert.equal(day(five).getHours(), 17);
  assert.equal(five.allDay, false);
  assert.equal(day(L.parseDue("by 11am", wed)).getDate(), 8, "a time already past today means tomorrow");
  assert.equal(day(L.parseDue("on Oct 12", wed)).getMonth(), 9);
  assert.equal(day(L.parseDue("on Oct 12", wed)).getDate(), 12);
  assert.equal(day(L.parseDue("by 10/20", wed)).getDate(), 20);
  assert.equal(day(L.parseDue("next week", wed)).getDay(), 5, "next week: by its Friday");
  assert.equal(L.parseDue("sometime", wed), null);
  assert.equal(day(L.parseDue("tonight", wed)).getHours(), 21);
});

test("promises in what you wrote", () => {
  const at = local(2026, 10, 7, 14);
  const p = L.findPromises("Hi Jake,\nThanks for the notes. I'll send you the deck by Friday. Let me know if that works?\n\nBest,\nMason", at);
  assert.equal(p.length, 1);
  assert.match(p[0].text, /I'll send you the deck by Friday/);
  assert.equal(new Date(p[0].due.t).getDate(), 9);
  assert.equal(L.findPromises("If I have time I'll look at it.", at).length, 0, "conditions aren't promises");
  assert.equal(L.findPromises("Will I see you there?", at).length, 0, "questions aren't promises");
  assert.equal(L.findPromises("I'll be there at 6.", at).length, 0, "being somewhere isn't a task");
  assert.equal(L.findPromises("> I'll send it tomorrow\nok thanks", at).length, 0, "quoted text isn't yours");
  const q = L.findPromises("Sure, I will follow up with the vendor tomorrow.", at);
  assert.equal(q.length, 1);
  assert.match(q[0].text, /^I will follow up/);
  assert.equal(L.findPromises("I'm going to review the PR tonight.", at)[0].due.allDay, false);
  assert.equal(L.findPromises("Let me check with the team and get back to you.", at).length, 1);
});

test("tone and attachments", () => {
  assert.equal(L.toneOf("This is RIDICULOUS and I'm SICK OF IT!!!").heated, true);
  assert.equal(L.toneOf("This is unacceptable.").heated, true);
  assert.equal(L.toneOf("Thanks! See you at the NASA event, ASAP is fine.").heated, false);
  assert.equal(L.toneOf("Great work!! Really.").heated, false, "one strong mark alone isn't heat");
  assert.equal(L.mentionsAttachment("I've attached the PDF."), true);
  assert.equal(L.mentionsAttachment("Thanks for the attachment!"), false, "someone else's attachment");
  assert.equal(L.toneOf("In the worst case we push to Monday.").heated, false, "a mild word alone isn't heat");
  assert.equal(L.toneOf("The files were just lying around.").heated, false);
  assert.equal(L.findPromises("Sarah will send you the invoice tomorrow.", Date.UTC(2026, 9, 16, 15)).length, 0, "someone else's promise");
  assert.equal(L.findPromises("We will send the forms by Friday.", Date.UTC(2026, 9, 16, 15)).length, 1);
  assert.equal(L.findPromises("Will send it over tomorrow.", Date.UTC(2026, 9, 16, 15)).length, 1);
  assert.equal(L.findPromises("I'll bring the deck 2 copies.", Date.UTC(2026, 9, 16, 15))[0].due, null, "deck 2 isn't Dec 2");
  assert.equal(L.findPromises("I'll do 1/2 of it now.", Date.UTC(2026, 9, 16, 15))[0].due, null, "a fraction isn't a date");
  assert.ok(L.findPromises("I'll send it by 11/3.", Date.UTC(2026, 9, 16, 15))[0].due, "by 11/3 is a date");
  assert.equal(L.mentionsAttachment("See you soon"), false);
  assert.equal(L.mentionsAttachment("Thanks!\n\nOn Tue, Oct 7, 2026, Jake wrote:\n> see attached"), false, "only your own words count");
});

test("where links go", () => {
  const g = L.realLink("https://www.google.com/url?q=https://example.com/a?b=1&sa=D&source=gmail");
  assert.equal(g.host, "example.com");
  assert.equal(g.url, "https://example.com/a?b=1");
  const s = L.realLink("https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fchase.com%2Flogin&data=x");
  assert.equal(s.host, "chase.com");
  const mc = L.realLink("https://mylist.us1.list-manage.com/track/click?u=abc&id=def&e=ghi");
  assert.equal(mc.via, "Mailchimp");
  assert.equal(mc.opaque, true);
  const sg = L.realLink("https://u123.ct.sendgrid.net/ls/click?upn=xyz&url=https%3A%2F%2Fshop.com%2Fdeal");
  assert.equal(sg.host, "shop.com");
  assert.equal(sg.via, "SendGrid");
  // any other site's ?url= is that site's own: the link goes there, and says so
  const evil = L.realLink("https://evil.example/go?url=https://www.paypal.com/signin");
  assert.equal(evil.host, "evil.example");
  assert.equal(evil.via, "");
  assert.equal(L.realLink("https://www.facebook.com/sharer/sharer.php?u=https://news.com/a").host, "facebook.com");
  // plain links to these sites aren't counters
  for (const x of ["https://www.salesforce.com/pricing", "https://blog.hubspot.com/marketing", "https://img.shields.io/badge/x"]) assert.equal(L.realLink(x).via, "", x);
  // counters with the destination in them, and without
  assert.equal(L.realLink("https://email.mg.example.com/c/abc?url=https%3A%2F%2Fexample.org%2Fx").host, "example.org");
  assert.equal(L.realLink("https://email.mg.example.com/c/abc").opaque, true);
  assert.equal(L.realLink("https://substack.com/redirect/abc?j=x").via, "Substack");
  assert.equal(L.realLink("mailto:a@b.com").mail, "a@b.com");
  assert.equal(L.textHost("www.PayPal.com"), "paypal.com");
  assert.equal(L.textHost("Click here"), "");
  assert.equal(L.textHost("https://chase.com/login"), "chase.com");
  assert.equal(L.sameSite("secure.chase.com", "chase.com"), true);
  assert.equal(L.sameSite("paypa1-login.xyz", "paypal.com"), false);
  assert.equal(L.sameSite("evil.co.uk", "bank.co.uk"), false);
  assert.equal(L.sameSite("online.bank.co.uk", "bank.co.uk"), true);
  assert.equal(L.sameSite("shop.com.au", "other.com.au"), false);
  assert.equal(L.sameSite("x.co.uk", "co.uk"), false);
  assert.equal(L.sameSite("WWW.Chase.com", "chase.com"), true);
  assert.equal(L.realLink("mailto:ann%40x.com?subject=hi").mail, "ann@x.com");
  assert.equal(L.realLink("tel:+15550100").tel, "+15550100");
  assert.equal(L.realLink("https://x.com").mail, "");
  assert.equal(L.trackerOf("http://[bad", 0, 0), "");
});

test("tracking pixels", () => {
  assert.equal(L.trackerOf("https://ci3.googleusercontent.com/proxy/abc#https://mylist.us1.list-manage.com/track/open.php?u=1", 1, 1), "Mailchimp");
  assert.equal(L.trackerOf("https://u1.ct.sendgrid.net/wf/open?upn=abc", 0, 0), "SendGrid");
  assert.equal(L.trackerOf("https://example.com/logo.png", 120, 40), "");
  assert.equal(L.trackerOf("https://example.com/spacer.gif", 1, 1), "a tracker");
  assert.equal(L.trackerOf("https://example.com/divider.png", 600, 1), "", "a divider is a picture");
  assert.equal(L.trackerOf("https://cdn.example.com/hero.jpg", 600, 300), "");
  assert.equal(L.trackerOf("https://example.com/open?id=abc", 0, 0), "a tracker");
  assert.equal(L.trackerOf("https://example.com/icons/open.png", 24, 24), "", "an icon called open is a picture");
  // a service's own pictures (responsive templates write no size) are pictures, not trackers
  assert.equal(L.trackerOf("https://cdn2.hubspot.net/hubfs/123/hero.png", 0, 0), "");
  assert.equal(L.trackerOf("https://gallery.mailchimp.com/abc/images/photo.jpg", 0, 0), "");
  assert.equal(L.trackerOf("https://image.exacttarget.com/lib/abc/m/1/hero.jpg", 0, 0), "");
  assert.equal(L.trackerOf("https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/images%2Fphoto.jpg?alt=media", 0, 0), "");
  // …and their open-tracking addresses still are, sized or not
  assert.equal(L.trackerOf("https://track.hubspot.com/e2t/to/abcdef", 0, 0), "HubSpot");
  assert.equal(L.trackerOf("https://mylist.us1.list-manage.com/track/open.php?u=1", 0, 0), "Mailchimp");
  assert.equal(L.trackerOf("https://u1.ct.sendgrid.net/wf/open.gif?upn=abc", 0, 0), "SendGrid");
  assert.equal(L.trackerOf("https://email.mg.example.com/o/eJwFwUEKgCAQBMDXuLNYbEuE", 0, 0), "Mailgun");
});

test("templates", () => {
  const v = { name: "Jake Lin", me: "Mason Chen", today: "Thursday, October 8" };
  assert.equal(L.fillTemplate("Hi {first},\n\nThanks!\n{my first}", v), "Hi Jake,\n\nThanks!\nMason");
  assert.equal(L.fillTemplate("Hi {first}, see you {today}.", v), "Hi Jake, see you Thursday, October 8.");
  assert.equal(L.fillTemplate("Hi {first}, ok", {}), "Hi, ok", "an empty name leaves no gap");
  assert.equal(L.fillTemplate("Keep {this} as is", v), "Keep {this} as is");
});

test("kinds of automated mail", () => {
  assert.equal(L.kindOfMail("Amazon", "Your order has shipped", ""), "Orders");
  assert.equal(L.kindOfMail("Google", "Security alert", "New sign-in on Mac"), "Security");
  assert.equal(L.kindOfMail("The Browser", "Issue #212: what we read", ""), "Newsletters");
  assert.equal(L.kindOfMail("Nike", "30% off everything", ""), "Promotions");
  assert.equal(L.kindOfMail("Instagram", "robbie mentioned you", ""), "Social");
  assert.equal(L.kindOfMail("GitHub", "[repo] Run failed", ""), "Updates");
});

test("the Gemini sheet's header", () => {
  const ok = L.sheetColumns(["Thread ID", "Received", "From", "Subject", "Summary", "Category", "Action", "Due", "Priority", "Reply needed", "Key detail", "Message ID", "Reply", "Reply label", ""]);
  assert.equal(ok.merged, false);
  assert.equal(ok.cols.tid, 0);
  assert.equal(ok.cols.mid, 11);
  assert.equal(ok.cols.rtext, 12);
  assert.equal(ok.cols.rlabel, 13);
  assert.equal(ok.cols.rep, 9);
  // what Google's query sends when it guesses several header rows: data glued onto the names
  const bad = L.sheetColumns(["Thread ID 1a11b98c269d6d37 1a11ba3193611", "Received October 8, 2026 at 8:59 AM EDT", "From a@b.c"]);
  assert.equal(bad.merged, true);
  // a column renamed with punctuation or spacing still counts
  assert.equal(L.sheetColumns(["Thread  ID:", "Reply needed?"]).cols.tid, 0);
  assert.equal(L.sheetColumns(["Thread  ID:", "Reply needed?"]).cols.rep, 1);
  assert.equal(L.sheetColumns(["Subject"]).cols.tid, -1);
});

test("hedged words aren't promises", () => {
  assert.equal(L.findPromises("Maybe I'll figure it out", Date.now()).length, 0);
  assert.equal(L.findPromises("I might send it tomorrow.", Date.now()).length, 0);
  assert.equal(L.findPromises("I'll send the slides by Friday.", Date.now()).length, 1);
});

test("search words: operators dropped, phrases kept, exclusions ignored", () => {
  assert.deepEqual([...L.findTerms("budget meeting")].sort(), ["budget", "meeting"]);
  assert.deepEqual([...L.findTerms('from:alice "project plan" -spam')].sort(), ["alice", "project plan"]);
  assert.deepEqual([...L.findTerms("subject:(quarterly report) has:attachment")].sort(), ["quarterly", "report"]);
  assert.deepEqual([...L.findTerms("invoice OR receipt in:inbox")].sort(), ["invoice", "receipt"]);
  assert.deepEqual([...L.findTerms("is:unread label:school")], []);
  assert.deepEqual([...L.findTerms("cc:me")], [], "me is you, not a word to find");
  assert.deepEqual([...L.findTerms("from:me budget")], ["budget"]);
  assert.deepEqual([...L.findTerms("a 2026")], ["2026"]);
  assert.equal(L.findRe("is:starred"), null);
});
test("search highlights: whole words from their start, any case, accents too", () => {
  const re = L.findRe("budget");
  assert.ok(re.test("The new Budget is here"));
  re.lastIndex = 0;
  assert.equal(L.around("We need to update the plan", L.findRe("date")), "");
  assert.ok(L.findRe("café").test("Meet at the café"));
  assert.ok(L.findRe("project plan").test("the project   plan for May"));
});
test("search context: the stretch around the first match, cut at words", () => {
  const long = "Intro words. ".repeat(20) + "Here is the budget for next year, attached as a sheet. " + "More words follow here. ".repeat(20);
  const t = L.around(long, L.findRe("budget"));
  assert.ok(t.startsWith("…") && t.endsWith("…"));
  assert.ok(t.includes("budget for next year"));
  assert.ok(t.length < 260);
  assert.equal(L.around("Short budget note", L.findRe("budget")), "Short budget note");
  assert.equal(L.around("", L.findRe("x1")), "");
});
test("an email's own words: quotes and quoted history dropped", () => {
  assert.equal(L.ownWords("Sounds good, see you then.\n\nOn Wed, Oct 7, 2026 at 6:03 PM Mason Chen <m@x.com> wrote:\n> Lunch at noon?\n> Thanks"), "Sounds good, see you then.");
  assert.equal(L.ownWords("Thanks!\n> earlier line\nmore of mine"), "Thanks!\nmore of mine");
  assert.equal(L.ownWords("FYI\n---------- Forwarded message ---------\nFrom: A"), "FYI");
  assert.equal(L.ownWords("Plain text with no quotes"), "Plain text with no quotes");
});

test("search words: grouping and other scripts", () => {
  assert.deepEqual([...L.findTerms("from:(ann OR bob) {bus train}")].sort(), ["ann", "bob", "bus", "train"]);
  assert.deepEqual([...L.findTerms("(invoice OR receipt) AND paid")].sort(), ["invoice", "paid", "receipt"]);
  const re = L.findRe("会議");
  assert.ok(re.test("明日の会議について"));
  re.lastIndex = 0;
  assert.deepEqual([...L.findTerms("猫")], ["猫"]);
  const en = L.findRe("art");
  assert.ok(!en.test("start"));
});

test("links that ask for a new message", () => {
  const plain = (d) => d && JSON.parse(JSON.stringify(d));
  assert.deepEqual(plain(L.composeLink("mailto:ana@example.com")), { to: ["ana@example.com"], cc: [], bcc: [], subject: "", text: "", u: null, email: "" });
  const m = plain(L.composeLink("mailto:ana@example.com,bo@example.com?cc=cy@example.com&BCC=di@example.com&subject=Lunch%20on%20Friday&body=Hi%2C%0D%0A2+2%3D4"));
  assert.deepEqual(m.to, ["ana@example.com", "bo@example.com"]);
  assert.deepEqual(m.cc, ["cy@example.com"]);
  assert.deepEqual(m.bcc, ["di@example.com"]);
  assert.equal(m.subject, "Lunch on Friday");
  assert.equal(m.text, "Hi,\n2+2=4", "a + in a mailto: link is a plus");
  const g = plain(L.composeLink("https://mail.google.com/mail/u/1/?view=cm&fs=1&to=ana@example.com&su=Hello+there&body=Line+one"));
  assert.deepEqual([g.to, g.subject, g.text, g.u], [["ana@example.com"], "Hello there", "Line one", 1]);
  const t = plain(L.composeLink("https://mail.google.com/mail/?tf=cm&fs=1&to=mailto:ana@example.com&authuser=me@example.com"));
  assert.deepEqual([t.to, t.u, t.email], [["ana@example.com"], null, "me@example.com"]);
  const h = plain(L.composeLink("https://mail.google.com/mail/?extsrc=mailto&url=" + encodeURIComponent("mailto:ana@example.com?subject=Hi%20you&cc=bo@example.com")));
  assert.deepEqual([h.to, h.cc, h.subject], [["ana@example.com"], ["bo@example.com"], "Hi you"]);
  assert.equal(L.composeLink("mailto:"), null, "nothing to fill in");
  assert.equal(L.composeLink("https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1"), null);
  assert.equal(L.composeLink("https://mail.google.com/mail/u/0/?view=cm&draft=r123&to=a@b.co"), null, "a draft opens as Gmail draws it");
  assert.equal(L.composeLink("https://mail.google.com/mail/u/0/#inbox"), null);
  assert.equal(L.composeLink("https://example.com/?view=cm&to=a@b.co"), null);
  assert.equal(L.composeLink("https://example.com/contact"), null);
});
