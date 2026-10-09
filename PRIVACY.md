# Umbra Mail Privacy Policy

Effective date: October 9, 2026

Umbra Mail redraws Gmail in your browser. It reads what Gmail shows you so it can show it differently, and it keeps its settings and caches on your computer. It has no server of its own, and the developer receives nothing from it. Umbra collects zero data.

In short:

- Umbra runs only on `mail.google.com`.
- Everything it stores stays in your browser, on your computer.
- Nothing is sent to the developer. There are no analytics, no telemetry and no ads.
- AI is off until you turn it on. When it is on, the content a request needs goes to the one provider you chose (with your ChatGPT sign-in or your own key), and to no one else.

This policy covers the Umbra Mail Chrome extension and the Umbra Mail userscript. Where they differ, it says so.

## Who makes Umbra Mail

Umbra Mail is a free project by an individual developer, Mason Chen, under the GNU General Public License v3.0. Its source code is public at <https://github.com/Mason363/UmbraMail>, so anyone can check what this policy describes.

For questions or requests about privacy, use <https://masn.studio/support> or open an issue at <https://github.com/Mason363/UmbraMail/issues>.

## What Umbra reads

Umbra runs on Gmail's pages and nowhere else. To draw its own screens, it reads what Gmail has on the page: your lists of conversations, the messages you open, names and email addresses, subjects, message text, attachment names, and Gmail's labels and settings. Every action you take (Done, Delete, Send, and so on) is handed back to Gmail, which carries it out.

Umbra also asks Gmail for a few things directly, as you, with the sign-in you already have:

- Gmail's feed for each signed-in account, to learn which accounts you're signed in to.
- A conversation's print view, to read it without opening it on screen (for Files, Catch me up, and AI).
- Attachments, when you download them or use "Keep copies, delete emails".
- Gmail searches, run in your Gmail tab, for features like Not opened, promises, and AI questions.

These requests go only to `mail.google.com`, just as Gmail's own requests do.

## What Umbra stores on your computer

### The Chrome extension's storage

The extension keeps its data in Chrome's extension storage (`chrome.storage.local`), in your Chrome profile on this computer. It does not use Chrome's sync storage, so none of it is copied to your Google account or to other computers. This is what it holds:

- **Your settings.** Look, layout, calm, writing and shortcut choices; your sender rules (the addresses you let through, send to the paper, or quiet); templates; pinned searches; account colors; your own CSS.
- **People.** Names, colors, emoji or pictures you set for people. Also the names of people Umbra sees in your mail, how often, and whether you've written to them; and the addresses of the Google profile photos Gmail shows for them (up to 400 each).
- **List caches.** For each account and folder Umbra has shown, up to 800 conversations: sender and recipients, subject, the first 140 characters, date, and whether each is unread, starred or has attachments. This lets lists appear at once and lets one tab show another account's mail.
- **File lists.** For Files: attachment names, sizes and kinds, with the sender and subject of their email.
- **AI results.** The newest 120 AI answers (summaries, suggested replies, brief lines, quick answers), the lines of each inbox's brief, a copy of Gmail's own to-dos where your account has them, and a few lines about you that the AI writes and you can edit (Settings › AI, "What Umbra knows about you").
- **Gemini's notes.** If you connect a Gemini sheet (Settings › Gemini), a copy of its newest 800 rows: what the flow wrote about each email, such as its sender, subject, summary, category, what to do and by when.
- **Reading time.** For Your time: the seconds each sender's mail has been open in front of you, by week, for the last two months.
- **Promises.** Up to 30 lines from mail you sent in the last two weeks ("I'll send it by Friday"), found on your computer without AI.
- **Not opened.** Which subscription senders you've opened mail from lately, kept for six hours.
- **Where you were.** Which conversations you've read here and the last message you saw in each, for Catch me up.
- **Your wallpaper.** The picture you choose as a background, if you choose one.
- **AI settings.** The provider you chose, its models, your API keys or your ChatGPT sign-in (its tokens, the address of the ChatGPT account, and Umbra's registration with OpenAI), the link to your Gemini sheet, and how many AI requests and tokens were used each day.
- **A message moving between accounts.** When you change a new message's From account, its recipients, subject and text, until it reaches the other account's page.
- **Bookkeeping.** Your signed-in accounts and their unread counts, tide times, which Gmail tab is open for which account, lines you've dismissed, web domains that have no logo, and the storage use Gmail reports.

### Gmail's site storage

Local recall (finding mail as you type in ⌘K) keeps an index in an IndexedDB database named `umbra-mail`. It lives in the site storage of `mail.google.com` on your computer. For each conversation Umbra has seen in a list, it keeps the account, the sender and people on it, the subject, the first 140 characters, the date, and whether it has attachments. It holds at most 40,000 conversations, oldest removed first. It never holds whole emails.

Umbra also keeps one note per tab in session storage: whether that tab shows all your accounts at once. It is gone when the tab closes.

### The userscript

The userscript stores the same things, but in your userscript manager's storage for the script (Violentmonkey or Tampermonkey) instead of Chrome's extension storage. The recall index is the same IndexedDB database in Gmail's site storage.

## What leaves your computer, and when

Umbra sends data to these places, and only these.

**Gmail.** The requests listed under "What Umbra reads", to `mail.google.com`, as you.

**Logos and photos.** A row from a company shows that company's logo. Umbra asks Google's public icon service (`t1.gstatic.com`) for the icon of the sender's web domain, such as `example.com`. Only the domain is in the request, never an email address, and no referrer is sent. People's photos load from the Google addresses Gmail itself uses.

**The AI provider you choose.** Only if you turn AI on and choose a provider in Settings › AI (or in the welcome, where you also agree to that provider's terms). Requests go straight from your browser to that provider, with your ChatGPT sign-in or your own API key, and without your cookies:

- OpenAI, with Sign in with ChatGPT (`auth.openai.com` to sign in, `api.openai.com` for requests, on your ChatGPT plan)
- Google's Gemini API (`generativelanguage.googleapis.com`)
- OpenAI, with your own key (`api.openai.com`)
- Anthropic (`api.anthropic.com`)

Each request carries only what that job needs:

- **The brief:** sender, subject, first line and time of up to 25 recent conversations, when the brief is on and Gmail's own Gemini isn't writing it.
- **Summaries:** a conversation's subject and text, with quoted replies left out. By default this happens as a long conversation opens; you can set it to only when you ask, or off.
- **Catch me up:** the new messages in a conversation, when you press Catch me up.
- **Suggested replies:** the conversation, your name, and the notes about you. By default only when someone is waiting on your reply.
- **Write with AI:** your instruction, your draft, the conversation and its recipients, your name and the notes about you, when you ask.
- **Find:** a question you type into Find, with today's date, to turn it into a Gmail search; then the question and the top 15 results (sender, subject, first line, date), to answer it.
- **Questions (Ask):** your question, your name, your accounts' names and addresses, the notes about you, and which conversation is on screen. The AI then asks Umbra to search your mail and read conversations, and those results go to the provider, from any of your signed-in accounts. A question takes at most six such rounds.
- **The notes about you:** about once a week, your name, your accounts, the 30 people you deal with most (names and addresses), and the subjects and first lines of up to 30 recent sent emails per account. The answer is a few lines kept on your computer.

What a provider does with a request is governed by that provider's own terms and privacy policy, under your account and key with them. Settings › AI shows how many requests were made today.

**Chrome's built-in model.** If you choose "On this device", the model runs inside Chrome on your computer, and nothing you read or write leaves it.

**Your Google Sheet.** Only if you connect a Gemini sheet in Settings › Gemini. That sheet is written by a Google Workspace Studio flow that you set up in your own Google account. Umbra reads it from `docs.google.com` with your Google sign-in, about every minute or two while a Gmail tab is in front.

**Sign in with ChatGPT.** Signing in happens on OpenAI's own pages, in a tab of your browser. OpenAI then sends the browser to an address on your own computer (`127.0.0.1`, port 47824), as it does for every app that signs in this way; nothing listens there. The Chrome extension catches that address before it loads and hands it to Umbra; with the userscript, you paste it into Umbra. Umbra then finishes the sign-in itself, straight with `auth.openai.com`. The tokens it receives stay in Umbra's storage on your computer and go only to OpenAI. Settings › AI › Sign out revokes them at OpenAI and removes them.

**Umbra's website.** <https://umbra.masn.studio> serves the userscript and its updates. Your userscript manager checks it for updates now and then, as it does for any script; that request carries nothing from Umbra. The userscript also runs on that site, only to tell the page it's installed. The site has no analytics and no cookies. Vercel, which hosts it, keeps standard request logs (such as your IP address and browser), as any web host does.

**Gmail's own Gemini.** Where your Google account has Gemini in Gmail, Umbra uses Gmail's own to-dos, suggestions and answers. That stays between you and Google, under Google's terms.

**Fonts (userscript only).** The userscript loads its fonts, Instrument Sans and Newsreader, from Google Fonts. The Chrome extension carries its fonts inside and loads nothing for them.

**Files you save.** "Keep copies, delete emails", downloads, and "Export settings" save files to your computer. An exported settings file holds your choices (settings, names and colors you set, dismissed lines). It never holds your mail, caches or API keys.

## What never happens

- No analytics, telemetry, crash reports or usage tracking of any kind.
- No Umbra server. The developer never receives your mail, your settings, your keys or anything else. (The website only serves the script.)
- No selling, renting, sharing or transferring of your data to anyone.
- No ads, and no use of your data for advertising, credit or lending decisions, or anything other than what Umbra does for you in Gmail.
- No remote code. All of Umbra's code is inside the extension or the userscript. It downloads nothing to run, and AI answers are shown as text, never run.
- No access to other websites. Umbra runs only on `mail.google.com` (and, as a userscript, on its own website, only to say it's installed).

## Your API keys and ChatGPT sign-in

If you use your own Gemini, OpenAI or Anthropic key (your ChatGPT sign-in is kept the same way):

- It is stored on your computer, in the extension's storage (or the userscript manager's).
- It is sent only to its own provider, in a request header, never in a web address.
- It is never put in an exported settings file, and Umbra hides anything that looks like a key in error messages.
- Settings › AI › Forget key removes it. Removing the extension removes it too.

## Deleting your data

- **Settings › Flags › Start over** puts your settings back as they started: look, layout, calm, shortcuts, the names and colors you gave people, templates, and dismissed lines. It does not remove caches or API keys.
- **Settings › AI › Forget key** removes a stored API key, and **Sign out** removes your ChatGPT sign-in (revoking it at OpenAI).
- **Settings › Look › Remove** removes your wallpaper picture.
- **Removing the extension** makes Chrome delete everything in its extension storage, keys and caches included.
- **The recall index** is in Gmail's site storage and stays after the extension is removed. Delete it any time in Settings › Flags › Remembered mail › Forget it (turning Remember off there also deletes it and keeps nothing new). After removing the extension you can still delete it from developer tools on a Gmail tab: Application › Storage › IndexedDB, select `umbra-mail`, Delete database. Clearing the site data for `mail.google.com` in Chrome's settings also deletes it, but it signs you out of Gmail as well.
- **The userscript's data** is kept with the script in your userscript manager. Deleting the script there deletes it.

None of these touch your mail in Gmail.

## Chrome Web Store user data policy

Umbra Mail's use of the data it handles complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. Data is used only to provide Umbra's features in Gmail, and is moved only as this policy describes.

## Children

Umbra Mail is not directed to children under 13. The developer does not collect personal information from anyone, children included.

## Changes to this policy

If Umbra Mail starts handling data in a new way, this policy will change first. The new version will be published at <https://umbra.masn.studio/privacy> with a new effective date.

## Contact

Use <https://masn.studio/support>, or open an issue at <https://github.com/Mason363/UmbraMail/issues>.
