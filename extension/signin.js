/* Umbra Mail: where ChatGPT's sign-in lands (the service worker's rule sends it here instead of 127.0.0.1).
   It leaves ChatGPT's answer where Umbra, in the Gmail tab that asked, picks it up and finishes the sign-in
   (only Umbra there holds the secret that makes the answer worth anything), then goes back to that tab. */
"use strict";
(async () => {
  const say = (t) => { document.getElementById("say").textContent = t; };
  const q = location.search.slice(1);
  if (!q) { say("Nothing to finish here. You can close this tab."); return; }
  // (the same JSON text Umbra's own storage writes)
  await chrome.storage.local.set({ "chatgpt-return": JSON.stringify({ url: "http://127.0.0.1:47824/auth/callback?" + q, at: Date.now() }) });
  history.replaceState(null, "", location.pathname);
  say(/(^|&)error=/.test(q) ? "ChatGPT didn't sign you in. You can close this tab." : "Signed in. Back to Gmail…");
  try {
    const me = await chrome.tabs.getCurrent();
    let to = me && me.openerTabId != null ? await chrome.tabs.get(me.openerTabId).catch(() => null) : null;
    if (!to) { const found = await chrome.tabs.query({ url: "https://mail.google.com/*" }); to = found[0] || null; }
    if (to) { await chrome.tabs.update(to.id, { active: true }); await chrome.windows.update(to.windowId, { focused: true }).catch(() => {}); }
    if (me && to) setTimeout(() => { chrome.tabs.remove(me.id).catch(() => {}); }, 900);
  } catch (e) { /* this tab stays: the words say what happened */ }
})();
