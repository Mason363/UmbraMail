# Chrome Web Store listing

Everything the Chrome Web Store dashboard asks for, ready to paste. The facts here come from `extension/manifest.json` and the code. Keep them in step with [PRIVACY.md](../PRIVACY.md).

## Store listing

**Name**

```
Umbra Mail
```

**Short description** (the manifest's `description`, 118 characters; the limit is 132)

```
A calmer, private Gmail: new mail a few times a day, newsletters in one page, and conversations that are easy to read.
```

**Category:** Productivity, under Communication. Workflow & Planning would also fit.

**Language:** English

**Detailed description** (plain text)

```
Umbra Mail is a calmer Gmail. It redraws Gmail's inbox, conversations and search in a quiet, readable design, and it changes when new mail reaches you. Gmail stays underneath: every action goes through Gmail itself, and your mail is never changed by being shown differently.

CALM
• Tides: new mail arrives two or three times a day, all at once. People you've marked and people waiting on you still come through.
• The paper: newsletters and notifications fold into one page, with a new edition each morning.
• Sender rules: let anyone through, send them to the paper, or quiet them for a month.
• Not opened and Your time: see the subscriptions you never open, and who takes your attention.

READING
• A brief at the top of the inbox that says what needs you.
• Reader view, people cards, and Catch me up for long conversations.
• Links show where they really go, and emails with tracking pixels say so.

WRITING
• Templates on Cmd+; (Ctrl+; on Windows).
• Considerate sending: late-night mail can wait for the morning, heated words are pointed out, and a missing attachment is noticed.
• Promises: what you said you'd do comes back as a quiet line until it's done.

FINDING AND DOING
• Cmd+K for almost anything, with mail you've seen found as you type.
• Shortcuts you can change, g then a letter to go anywhere, selection and bulk actions, and undo.
• Files: every attachment in one place, with previews. Keep copies and delete the emails to free up Google storage.

LOOKS
• Dark, bright, or match your system. A color, your own picture, or the sky as it is now behind your mail. Glass, grain, fonts and spacing your way.

OPTIONAL AI
AI is off until you turn it on. Sign in with ChatGPT (your Plus or Pro plan), choose Gemini, OpenAI or Anthropic with your own API key, or use Chrome's built-in model on your computer. Only what a request needs goes to the provider you choose, straight from your browser.

PRIVACY
Umbra Mail collects zero data. It has no server and sends nothing to its developer. No analytics, no ads. Settings and caches stay on your computer.

https://umbra.masn.studio
```

**Homepage URL:** `https://umbra.masn.studio`
**Support URL:** `https://masn.studio/support`

**Graphics:** the 128×128 icon is `extension/icon128.png`. The store also needs at least one screenshot (1280×800 or 640×400).

## Single purpose

```
Umbra Mail changes how Gmail looks and works at mail.google.com. It redraws Gmail's own inbox, conversations and search as a calmer, more readable mail client, and lets the user decide when new mail appears. Every feature, including the optional AI, acts only on the user's own Gmail, inside that one interface.
```

## Permission justifications

**storage**

```
Saves the user's settings (look, layout, shortcuts, sender rules, templates) and caches that make Gmail lists appear at once, in chrome.storage.local on the user's computer. Umbra Mail has no server, so this is the only place its data lives.
```

**unlimitedStorage**

```
The local caches can pass Chrome's default 10 MB limit: lists of up to 800 conversations per folder for each signed-in account, the list of files, and a wallpaper picture the user may choose. Without it, saving could fail and settings could be lost. Everything stays on the user's computer.
```

**Host permission: https://mail.google.com/\***

```
Umbra Mail runs on Gmail and nowhere else. Its content script reads the Gmail page to redraw it and hands every action back to Gmail. It also requests Gmail pages as the signed-in user: the account feed (to list signed-in accounts), a conversation's print view (to read it without opening it), and attachments the user chooses to download.
```

**Host permission: https://docs.google.com/\***

```
Optional feature. If the user connects a Google Sheet in Settings › Gemini (a sheet that a Google Workspace Studio flow in their own account writes to), Umbra Mail reads that sheet as CSV with the user's own Google sign-in. Nothing is written to it. Without a connected sheet, no request is made.
```

**Host permission: https://generativelanguage.googleapis.com/\***

```
Optional AI. Only if the user turns AI on and chooses Gemini with their own API key, Umbra Mail sends the content a request needs (for example, an email to summarize) to Google's Gemini API, straight from the browser, with the key in a header and without cookies.
```

**Host permission: https://api.openai.com/\***

```
Optional AI. Only if the user turns AI on and chooses OpenAI with their own API key, Umbra Mail sends the content a request needs to OpenAI's API, straight from the browser, without cookies.
```

**Host permission: https://api.anthropic.com/\***

```
Optional AI. Only if the user turns AI on and chooses Anthropic with their own API key, Umbra Mail sends the content a request needs to Anthropic's API, straight from the browser, without cookies.
```

**Host permission: https://auth.openai.com/\***

```
Optional AI. Only if the user chooses Sign in with ChatGPT: after the user signs in on OpenAI's own page, Umbra Mail exchanges the one-time code for tokens at OpenAI's sign-in server (and renews them there), straight from the browser, without cookies. The tokens stay on the user's computer and are sent only to OpenAI.
```

**declarativeNetRequestWithHostAccess, and host permission: http://127.0.0.1/\***

```
Sign in with ChatGPT ends, as OpenAI requires for apps like this one, by sending the browser to an address on the user's own computer (http://127.0.0.1:47824/auth/callback). Nothing listens there. One dynamic rule redirects exactly that address, for top-level navigations only, to the extension's own page (signin.html), which hands the sign-in to Umbra in the Gmail tab. The extension never fetches anything from 127.0.0.1 (its service worker refuses such requests); the host permission is only what lets the rule apply there.
```

**No optional permissions.** The extension asks for nothing after install.

**Content script on https://mail.google.com/\*** (covered by the host permission above)

```
compat.js and umbra.js run at document_start in the main frame of Gmail only, so Umbra can draw its view before Gmail's appears.
```

**Web-accessible resources: signin.html, for https://auth.openai.com/\* and http://127.0.0.1/\***

```
The page ChatGPT's sign-in lands on (through the rule above). It's reachable only as the end of that sign-in.
```

**Web-accessible resources: fonts/\*.woff2, for https://mail.google.com/\***

```
The fonts Umbra Mail uses (Instrument Sans and Newsreader, SIL Open Font License) ship inside the extension. Gmail's page loads them from the extension, so no font is fetched from the internet.
```

The extension asks for nothing else: no `tabs`, `activeTab`, `scripting`, `cookies`, `identity`, `history` or `<all_urls>`. Opening a tab and the toolbar button's action use APIs that need no permission.

## Remote code

Answer: **No, I am not using remote code.**

```
All of Umbra Mail's JavaScript is inside the extension package. It loads no scripts from anywhere, uses no eval or new Function, and runs nothing it receives. Replies from AI providers and from Google Sheets are read as text or JSON data and shown as text. The extension's pages use the policy script-src 'self'.
```

## Data usage

Answers for the "What user data do you plan to collect" form. Umbra Mail handles this data in the browser to do its job. It stores it only on the user's computer, and sends it nowhere except where the user turns a feature on. The developer receives none of it.

| Category | Tick | What Umbra Mail handles, and where it goes |
| --- | --- | --- |
| Personally identifiable information | Yes | Names and email addresses of the user and the people in their mail, as Gmail shows them. Used to display mail and people, and kept on the user's computer. Sent only to the user's chosen AI provider, inside an AI request the user turned on (for example, who an email is from). |
| Health information | No | Not sought or used. Emails may mention anything; those are covered under Personal communications. |
| Financial and payment information | No | Not sought or used. Same as above. |
| Authentication information | Yes | The user's own API keys for Gemini, OpenAI or Anthropic, if they add one, or the tokens of their ChatGPT sign-in. Stored on the user's computer and sent only to that provider. Umbra never reads Google or OpenAI passwords or cookies; its requests to Gmail and Google Sheets use the browser's existing sign-in. |
| Personal communications | Yes | The user's emails: read from Gmail to display them, cached in part on the user's computer (subjects, senders, first lines). Sent only to the user's chosen AI provider, and only the content an AI request needs, if the user turned AI on. |
| Location | No | Not used. The sky background follows the computer's clock. |
| Web history | No | Umbra runs only on mail.google.com and reads no browsing history. |
| User activity | Yes | For "Your time", the seconds each sender's mail is open while the tab is in front and the user is active, kept by week on the user's computer and never sent. Keys are watched for shortcuts, never recorded. (This is the cautious answer. Since nothing leaves the device, you could also answer No.) |
| Website content | Yes | The text, images and links of Gmail pages, read to redraw Gmail. Also the rows of the user's own Google Sheet, if connected. Content leaves the computer only in AI requests the user turned on. |

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://umbra.masn.studio/privacy`

## Notes for the reviewer

```
Umbra Mail needs a Gmail account. Install it and open https://mail.google.com. A short welcome appears on the first visit; AI stays off unless you choose it there or in Settings › AI. The toolbar button (or Cmd/Ctrl+,) opens Umbra's settings inside Gmail. Press ? for every shortcut, or Cmd/Ctrl+K for the action bar. Nothing needs a server or an account with the developer.
```

## Before you submit

- All AI runs in the browser; nothing outside it is involved (ChatGPT's sign-in is caught by the rule above).
- Build with `npm run build` and zip the contents of `dist/extension/`, not the folder around them.
