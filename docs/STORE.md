# Chrome Web Store listing

Everything the Chrome Web Store dashboard asks for, ready to paste. Keep it in step with `extension/manifest.json` and [PRIVACY.md](../PRIVACY.md).

## Store listing

**Name**

```
Umbra Mail
```

**Short description** (the manifest's `description`)

```
A calmer Gmail. Private, free and open source.
```

**Category:** Productivity › Communication

**Language:** English

**Detailed description**

```
Umbra is a calmer Gmail.

It redraws Gmail so it's quiet and easy to read. Gmail stays underneath, and everything you do still goes through Gmail.

• New mail can arrive a few times a day, all at once.
• Newsletters can fold into one page each morning.
• Conversations are easy to read.
• ⌘K or Ctrl+K does almost anything.
• Dark or light, flat or soft, with your own background.

AI is optional and off by default. If you turn it on, you choose the provider, and only what a request needs goes to it, straight from your browser.

Umbra collects zero data. No server, no tracking, no ads.

Free and open source: github.com/Mason363/UmbraMail
```

**Homepage URL:** `https://umbra.masn.studio`

**Support URL:** `https://masn.studio/support`

**Privacy policy URL:** `https://umbra.masn.studio/privacy`

## Graphics

Drawn by `node docs/store/render.mjs` (after `npm run build`) from the scenes in `docs/store/scenes/`, with mail that's made up.

| Field | File |
| --- | --- |
| Icon, 128 × 128 | `extension/icon128.png` |
| Screenshots, 1280 × 800, in this order | `docs/store/screenshot-1-inbox.png` … `screenshot-5-welcome.png` |
| Small promo tile, 440 × 280 | `docs/store/tile-small.png` |
| Marquee promo tile, 1400 × 560 | `docs/store/tile-marquee.png` |

## Single purpose

```
Umbra Mail changes how Gmail looks and works at mail.google.com. It redraws Gmail's own inbox and conversations as a calmer mail client. Every feature, including the optional AI, works only on the user's own Gmail.
```

## Permission justifications

**storage**

```
Saves the user's settings, and caches that make Gmail's lists appear at once, on the user's computer. Umbra Mail has no server.
```

**unlimitedStorage**

```
The local caches (conversation lists for each signed-in account, and a background picture the user may choose) can pass Chrome's 10 MB default. Everything stays on the user's computer.
```

**Host permission: https://mail.google.com/\***

```
Umbra Mail runs only on Gmail. It reads the page to redraw it and hands every action back to Gmail. It also loads Gmail pages as the signed-in user: the account list, a conversation's print view, and attachments the user downloads.
```

**Host permission: https://docs.google.com/\***

```
Optional. If the user connects one of their own Google Sheets in Settings, Umbra Mail reads it as CSV with their Google sign-in. It never writes to it. With no sheet connected, no request is made.
```

**Host permission: https://generativelanguage.googleapis.com/\***

```
Optional AI. Only if the user turns AI on with their own Gemini API key: the text a request needs goes to Google's Gemini API, straight from the browser.
```

**Host permission: https://api.openai.com/\***

```
Optional AI. Only if the user turns AI on with their own OpenAI API key or Sign in with ChatGPT: the text a request needs goes to OpenAI's API, straight from the browser.
```

**Host permission: https://api.anthropic.com/\***

```
Optional AI. Only if the user turns AI on with their own Anthropic API key: the text a request needs goes to Anthropic's API, straight from the browser.
```

**Host permission: https://auth.openai.com/\***

```
Optional AI. Only for Sign in with ChatGPT: after the user signs in on OpenAI's page, Umbra Mail trades the one-time code for tokens there, and renews them there. The tokens stay on the user's computer and go only to OpenAI.
```

**declarativeNetRequestWithHostAccess, and host permission: http://127.0.0.1/\***

```
Sign in with ChatGPT ends by sending the browser to http://127.0.0.1:47824/auth/callback, as OpenAI requires. Nothing listens there. One rule redirects exactly that address (top-level only) to the extension's own signin.html, which passes the sign-in to the Gmail tab. The extension never fetches from 127.0.0.1; the host permission only lets the rule apply.
```

**Content script on https://mail.google.com/\*** (covered above)

```
compat.js and umbra.js run at document_start in Gmail's main frame only, so Umbra can draw before Gmail does.
```

**Web-accessible resources: signin.html, for https://auth.openai.com/\* and http://127.0.0.1/\***

```
The page ChatGPT's sign-in lands on, through the rule above. Used only at the end of that sign-in.
```

**Web-accessible resources: fonts/\*.woff2, for https://mail.google.com/\***

```
Umbra's fonts (Instrument Sans and Newsreader, SIL Open Font License) ship inside the extension, so no font is fetched from the internet.
```

No optional permissions, and nothing else: no `tabs`, `activeTab`, `scripting`, `cookies`, `identity`, `history` or `<all_urls>`.

## Remote code

Answer: **No, I am not using remote code.**

```
All of Umbra Mail's code is in the package. It loads no scripts, uses no eval or new Function, and runs nothing it receives. Replies from AI providers and Google Sheets are read as data and shown as text.
```

## Data usage

Umbra Mail handles this data in the browser to do its job, keeps it on the user's computer, and sends it nowhere except where the user turns a feature on. The developer receives none of it.

| Category | Tick | Why |
| --- | --- | --- |
| Personally identifiable information | Yes | Names and addresses in the user's mail, to show them. Sent only inside an AI request the user turned on. |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | Yes | The user's own AI key or ChatGPT sign-in, if they add one. Kept on their computer, sent only to that provider. |
| Personal communications | Yes | The user's emails, to show them, partly cached on their computer. Sent only inside an AI request the user turned on. |
| Location | No | |
| Web history | No | |
| User activity | Yes | How long each sender's mail is open, for "Your time", kept on the user's computer and never sent. (Cautious: since nothing leaves the device, No is also defensible.) |
| Website content | Yes | Gmail's pages, to redraw them, and the user's own Google Sheet if connected. Sent only inside an AI request the user turned on. |

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Notes for the reviewer

```
Needs a Gmail account. Install, then open https://mail.google.com. A short welcome appears; AI stays off unless you choose it. The toolbar button opens Umbra's settings, ? shows every shortcut, and Cmd/Ctrl+K opens the action bar. No server, no account with the developer.
```

## Before you submit

Run `npm run build`, then zip the contents of `dist/extension/` (not the folder around them).
