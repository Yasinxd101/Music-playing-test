# Background Player

A small, installable web app that plays **YouTube videos and playlists**. Paste a
link (or a raw video/playlist ID) and it plays — including when you switch to
another tab or minimize the window. It registers OS / lock-screen media controls
via the Media Session API and can be installed to your home screen as a PWA.

## Use it

1. Open `index.html` over **HTTPS** (or `http://localhost`). The Media Session
   API and the service worker both require a secure context.
2. Paste any of:
   - a video link — `https://youtu.be/dQw4w9WgXcQ`, `https://www.youtube.com/watch?v=…`, `/shorts/…`, `/embed/…`
   - a playlist link — `https://www.youtube.com/playlist?list=PL…`
   - a "video in playlist" link — `…/watch?v=…&list=PL…` (plays that video, then continues the list)
   - a bare ID — an 11-char video ID, or a `PL…`/`RD…`/`UU…` playlist ID
3. Press **Play**. Use the on-screen controls (or your device's media controls)
   for play/pause, previous/next, loop, and shuffle.

You can also deep-link: `index.html?url=<link>`, `?v=<id>`, or `?list=<id>`.

## Honest note on "while my phone is locked"

| Situation | Does audio keep playing? |
|---|---|
| Desktop, switch to another tab / minimize | ✅ Yes |
| Mobile, switch browser tabs | ⚠️ Usually pauses |
| Mobile, **screen locked** | ❌ Browsers + YouTube intentionally suspend embedded video |

Uninterrupted background/locked-screen playback of YouTube is, by design, a
**YouTube Premium** feature. No web page can fully bypass that — embedded players
are paused by the mobile OS and by YouTube's own embed rules. This app does what a
web app legitimately can: keep playing across desktop tabs, and surface
**lock-screen play/pause/skip controls** through the Media Session API wherever the
browser allows. Installing it (Add to Home Screen) gives the best background
behavior your device permits.

## Deploy (free, via GitHub Pages)

This is a static site — no build step.

1. Push to GitHub (this branch / repo).
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch**.
3. Pick the branch and `/ (root)` folder, save.
4. Open the published `https://<user>.github.io/<repo>/` URL on any device.

To run locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Files

| File | Purpose |
|---|---|
| `index.html` | App layout |
| `styles.css` | Styling |
| `app.js` | Link parsing, YouTube IFrame player, Media Session, PWA glue |
| `manifest.json` | PWA metadata for installation |
| `sw.js` | Service worker (caches the app shell; never caches YouTube) |
| `icons/` | App icons |

## Privacy

Everything runs in your browser. There's no backend and nothing is stored on a
server — links you paste are sent only to YouTube to play the content.
