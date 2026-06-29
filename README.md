# 🎵 TuneStream

A tiny, no-login web app: **paste a YouTube video or playlist link and keep it playing**
while you work in another tab. Built as a single static page — no server, no build step,
no API key.

## What it does

- Paste a **video link**, **playlist link**, **`youtu.be` short link**, **Shorts link**, or
  even a bare video/playlist ID — it figures out which is which.
- Builds an **Up Next queue** with thumbnails and titles (fetched via YouTube's public oEmbed
  endpoint, so no API key is needed).
- **Play / pause / next / previous / shuffle / loop** controls.
- **⧉ Pop-out floating player** — on desktop Chrome/Edge the player jumps into a small
  always-on-top window (via the [Document Picture-in-Picture API]) so it keeps playing while you
  browse other tabs and apps.
- **⛶ Fullscreen** mode for a distraction-free player.
- **🔒 Lock** button — blocks accidental taps while the music keeps playing; hold to unlock.
- **Lock-screen & keyboard media controls** via the [Media Session API] — your phone's lock
  screen and laptop media keys can control playback and show the cover art.
- **Auto-advances** through the queue and **skips** videos that can't be embedded.
- **Remembers your queue** between visits (stored locally in your browser).
- **Installable** as a PWA — "Add to Home Screen" for an app-like experience.

## Will it really play with my phone screen off? (Honest answer)

| Situation | Works? |
| --- | --- |
| Desktop browser, switched to another tab | ✅ Yes — audio keeps playing |
| Desktop browser minimized | ✅ Yes |
| Phone, this app's tab in the foreground | ✅ Yes |
| Phone, screen **locked** / different app | ⚠️ Limited — see below |

YouTube **deliberately blocks** embedded players from playing in the background on mobile when
the screen is locked — uninterrupted background play is a paid **YouTube Premium** feature, and
no embed/web app can legitimately bypass it. To get as close as possible on a phone:

1. Use the **⧉ Picture-in-Picture** button (then YouTube's own PiP/fullscreen control) so the
   video floats over other apps and keeps playing.
2. Use the **lock-screen media controls** this app registers.
3. For true screen-off background audio, **YouTube Premium** (or the YouTube Music app) is the
   only sanctioned option.

This app uses the **official YouTube IFrame Player**, so it stays within YouTube's terms — it
doesn't strip ads or rip audio.

## Running it

It's just static files. Any of these work:

```bash
# Python
python3 -m http.server 8000
# then open http://localhost:8000

# Node
npx serve .
```

Or deploy the folder to **GitHub Pages**, Netlify, Vercel, Cloudflare Pages — anywhere that
serves static files over HTTPS. (HTTPS is needed for the service worker / installability.)

### Deploy to GitHub Pages (automated)

This repo ships a workflow at `.github/workflows/deploy.yml` that builds and publishes the site
automatically on every push.

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**. *(One-time toggle —
   GitHub requires the repo owner to opt in; it can't be flipped from code.)*
3. Push to this branch (or `main`). The **Deploy to GitHub Pages** action runs and prints the
   live URL in its summary.

Once published, open that URL on your phone and tap **Add to Home Screen** to use it like an app.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup & layout |
| `styles.css` | Dark theme styling |
| `app.js` | URL parsing, queue, player + Media Session wiring |
| `manifest.json` | PWA metadata (installable) |
| `sw.js` | Service worker (offline app shell) |

## Limitations & ideas for later

- Playlist titles load one-by-one via oEmbed; very large playlists take a moment to fill in.
- Adding a playlist relies on YouTube enumerating it; private/unavailable playlists can't be read.
- A future version could add drag-to-reorder, search, and a "radio" mode.

[Media Session API]: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API
[Document Picture-in-Picture API]: https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API
