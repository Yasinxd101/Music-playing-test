/* Background Player — YouTube video & playlist player with Media Session controls. */

(() => {
  'use strict';

  // ---- DOM ----
  const form = document.getElementById('loadForm');
  const input = document.getElementById('urlInput');
  const hint = document.getElementById('hint');
  const placeholder = document.getElementById('placeholder');
  const nowPlaying = document.getElementById('nowPlaying');
  const npTitle = document.getElementById('npTitle');
  const npAuthor = document.getElementById('npAuthor');
  const controls = document.getElementById('controls');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const loopBtn = document.getElementById('loopBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const installBtn = document.getElementById('installBtn');

  let player = null;
  let ready = false;
  let pending = null; // request queued before player is ready
  let looping = false;
  let shuffling = false;

  // ---- YouTube link parsing ----
  // Returns { kind: 'video'|'playlist', id } or null.
  function parseInput(raw) {
    const text = (raw || '').trim();
    if (!text) return null;

    // Bare ID heuristics first (no slashes, no spaces).
    if (!/[\s/]/.test(text)) {
      if (/^(PL|UU|LL|FL|RD|OL)[A-Za-z0-9_-]+$/.test(text)) {
        return { kind: 'playlist', id: text };
      }
      if (/^[A-Za-z0-9_-]{11}$/.test(text)) {
        return { kind: 'video', id: text };
      }
    }

    let url;
    try {
      url = new URL(text.includes('://') ? text : 'https://' + text);
    } catch {
      return null;
    }

    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const isYouTube =
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be' ||
      host.endsWith('.youtube.com');
    if (!isYouTube) return null;

    const params = url.searchParams;
    const list = params.get('list');
    const v = params.get('v');

    // youtu.be/<id>
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      if (v || list) {
        // youtu.be can also carry a list param
        if (list && !id) return { kind: 'playlist', id: list };
      }
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return { kind: 'video', id, list };
      if (list) return { kind: 'playlist', id: list };
      return null;
    }

    // /shorts/<id>, /embed/<id>, /live/<id>
    const pathMatch = url.pathname.match(/\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
    if (pathMatch) return { kind: 'video', id: pathMatch[2], list };

    // /playlist?list=...
    if (url.pathname.startsWith('/playlist') && list) {
      return { kind: 'playlist', id: list };
    }

    // /watch?v=...&list=...  — prefer the specific video, keep list for next/prev.
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) {
      return { kind: 'video', id: v, list };
    }

    if (list) return { kind: 'playlist', id: list };

    return null;
  }

  function showHint(msg, isError) {
    hint.textContent = msg;
    hint.classList.toggle('error', !!isError);
  }

  // ---- Load the YouTube IFrame API ----
  function loadYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onReady: () => {
          ready = true;
          if (pending) {
            const p = pending;
            pending = null;
            startPlayback(p);
          }
        },
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  };

  function onPlayerError(e) {
    const codes = {
      2: 'That link looks invalid.',
      5: 'This content can’t be played in an embedded player.',
      100: 'Video not found (it may be removed or private).',
      101: 'The owner of this video has disabled embedded playback.',
      150: 'The owner of this video has disabled embedded playback.',
    };
    showHint(codes[e.data] || 'Could not play that item.', true);
  }

  // ---- Playback ----
  function startPlayback(req) {
    placeholder.hidden = true;
    nowPlaying.hidden = false;
    controls.hidden = false;

    if (req.kind === 'playlist') {
      player.loadPlaylist({ list: req.id, listType: 'playlist', index: 0 });
    } else if (req.list) {
      // Specific video that belongs to a playlist: load the list starting near the video.
      player.loadPlaylist({ list: req.list, listType: 'playlist' });
      // Then jump to the specific video.
      setTimeout(() => {
        try { player.loadVideoById(req.id); } catch {}
      }, 300);
    } else {
      player.loadVideoById(req.id);
    }
    showHint('Now playing.', false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const parsed = parseInput(input.value);
    if (!parsed) {
      showHint('Hmm, that doesn’t look like a YouTube video or playlist link.', true);
      return;
    }
    if (!ready) {
      pending = parsed;
      placeholder.querySelector('span').textContent = 'Loading player…';
      return;
    }
    startPlayback(parsed);
  }

  function onPlayerStateChange(e) {
    const YTS = window.YT.PlayerState;
    if (e.data === YTS.PLAYING) {
      playPauseBtn.textContent = '⏸';
    } else if (e.data === YTS.PAUSED) {
      playPauseBtn.textContent = '▶';
    } else if (e.data === YTS.ENDED && looping) {
      // Single-video loop (playlists loop via setLoop).
      try { player.seekTo(0); player.playVideo(); } catch {}
    }
    if (e.data === YTS.PLAYING || e.data === YTS.PAUSED) {
      updateNowPlaying();
      updateMediaSession();
    }
  }

  function updateNowPlaying() {
    try {
      const data = player.getVideoData();
      npTitle.textContent = data.title || '—';
      npAuthor.textContent = data.author || '';
    } catch { /* ignore */ }
  }

  // ---- Media Session (lock-screen / OS controls) ----
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    let data = {};
    try { data = player.getVideoData() || {}; } catch {}
    const videoId = data.video_id;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: data.title || 'YouTube',
      artist: data.author || '',
      album: 'Background Player',
      artwork: videoId
        ? [
            { src: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
            { src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
          ]
        : [],
    });
  }

  function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const safe = (fn) => () => { try { fn(); } catch {} };
    navigator.mediaSession.setActionHandler('play', safe(() => player.playVideo()));
    navigator.mediaSession.setActionHandler('pause', safe(() => player.pauseVideo()));
    navigator.mediaSession.setActionHandler('previoustrack', safe(() => player.previousVideo()));
    navigator.mediaSession.setActionHandler('nexttrack', safe(() => player.nextVideo()));
    navigator.mediaSession.setActionHandler('seekbackward', safe(() => {
      player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
    }));
    navigator.mediaSession.setActionHandler('seekforward', safe(() => {
      player.seekTo(player.getCurrentTime() + 10, true);
    }));
  }

  // ---- Control buttons ----
  function togglePlay() {
    if (!ready) return;
    const state = player.getPlayerState();
    if (state === window.YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  }

  playPauseBtn.addEventListener('click', togglePlay);
  prevBtn.addEventListener('click', () => { try { player.previousVideo(); } catch {} });
  nextBtn.addEventListener('click', () => { try { player.nextVideo(); } catch {} });

  loopBtn.addEventListener('click', () => {
    looping = !looping;
    loopBtn.classList.toggle('active', looping);
    try { player.setLoop(looping); } catch {}
  });

  shuffleBtn.addEventListener('click', () => {
    shuffling = !shuffling;
    shuffleBtn.classList.toggle('active', shuffling);
    try { player.setShuffle(shuffling); if (shuffling) player.nextVideo(); } catch {}
  });

  form.addEventListener('submit', handleSubmit);

  // Keep media session metadata fresh as tracks change within a playlist.
  setInterval(() => {
    if (ready && !nowPlaying.hidden) {
      const t = npTitle.textContent;
      updateNowPlaying();
      if (npTitle.textContent !== t) updateMediaSession();
    }
  }, 3000);

  // ---- PWA install prompt ----
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  // ---- Service worker (offline shell + installability) ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // ---- Boot ----
  setupMediaSessionHandlers();
  loadYouTubeAPI();

  // Prefill from ?v=, ?list=, or ?url= so links can deep-link into the player.
  const qp = new URLSearchParams(location.search);
  const deep = qp.get('url') || qp.get('v') || qp.get('list');
  if (deep) {
    input.value = deep;
    // Defer until the API marks ready.
    const parsed = parseInput(deep);
    if (parsed) pending = parsed;
  }
})();
