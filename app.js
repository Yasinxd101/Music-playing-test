/* TuneStream — background YouTube/music player
 * Pure client-side. Uses the YouTube IFrame Player API + Media Session API.
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'tunestream.queue.v1';

  // ---- App state ----
  /** @type {{id:string,title:string,author:string}[]} */
  let queue = loadQueue();
  let current = queue.length ? 0 : -1;
  let player = null;
  let playerReady = false;
  let shuffle = false;
  let loopQueue = true;
  let isPlaying = false;

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const els = {
    form: $('add-form'),
    input: $('url-input'),
    hint: $('hint'),
    placeholder: $('player-placeholder'),
    npTitle: $('np-title'),
    npAuthor: $('np-author'),
    playBtn: $('play-btn'),
    prevBtn: $('prev-btn'),
    nextBtn: $('next-btn'),
    pipBtn: $('pip-btn'),
    shuffleBtn: $('shuffle-btn'),
    loopBtn: $('loop-btn'),
    clearBtn: $('clear-btn'),
    list: $('queue-list'),
    empty: $('queue-empty'),
  };

  // ---------------------------------------------------------------------------
  // URL parsing
  // ---------------------------------------------------------------------------

  /** Returns { videoId?, playlistId? } parsed from many YouTube URL shapes. */
  function parseYouTube(raw) {
    const out = {};
    let url;
    try {
      url = new URL(raw.trim());
    } catch {
      // Maybe they pasted a bare ID
      const bare = raw.trim();
      if (/^[\w-]{11}$/.test(bare)) out.videoId = bare;
      else if (/^PL[\w-]+$|^(OLAK5|RD|UU|LL|FL)[\w-]+$/.test(bare)) out.playlistId = bare;
      return out;
    }

    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    const params = url.searchParams;

    if (params.get('list')) out.playlistId = params.get('list');

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1);
      if (/^[\w-]{11}$/.test(id)) out.videoId = id;
    } else if (host.endsWith('youtube.com')) {
      if (params.get('v')) {
        out.videoId = params.get('v');
      } else if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) {
        const id = url.pathname.split('/')[2];
        if (/^[\w-]{11}$/.test(id)) out.videoId = id;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Metadata (best effort, no API key) via YouTube oEmbed
  // ---------------------------------------------------------------------------

  async function fetchMeta(videoId) {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (!res.ok) throw new Error('oembed ' + res.status);
      const data = await res.json();
      return { title: data.title || videoId, author: data.author_name || '' };
    } catch {
      return { title: videoId, author: '' };
    }
  }

  // ---------------------------------------------------------------------------
  // Queue persistence + rendering
  // ---------------------------------------------------------------------------

  function loadQueue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => x && x.id) : [];
    } catch {
      return [];
    }
  }

  function saveQueue() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch { /* storage full / disabled — ignore */ }
  }

  function renderQueue() {
    els.list.innerHTML = '';
    els.empty.style.display = queue.length ? 'none' : 'block';

    queue.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'queue-item' + (i === current ? ' playing' : '');
      li.dataset.index = String(i);

      const thumb = document.createElement('img');
      thumb.className = 'qi-thumb';
      thumb.loading = 'lazy';
      thumb.alt = '';
      thumb.src = `https://i.ytimg.com/vi/${item.id}/default.jpg`;

      const meta = document.createElement('div');
      meta.className = 'qi-meta';
      const title = document.createElement('div');
      title.className = 'qi-title';
      title.textContent = item.title || item.id;
      const author = document.createElement('div');
      author.className = 'qi-author';
      author.textContent = item.author || '';
      meta.append(title, author);

      const remove = document.createElement('button');
      remove.className = 'qi-remove';
      remove.title = 'Remove';
      remove.textContent = '×';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeAt(i);
      });

      li.append(thumb, meta, remove);
      li.addEventListener('click', () => playAt(i));
      els.list.appendChild(li);
    });
  }

  function removeAt(i) {
    const wasCurrent = i === current;
    queue.splice(i, 1);
    if (i < current) current--;
    else if (wasCurrent) {
      current = Math.min(current, queue.length - 1);
    }
    saveQueue();
    renderQueue();
    if (queue.length === 0) {
      current = -1;
      stopPlayback();
    } else if (wasCurrent) {
      playAt(current);
    }
  }

  // ---------------------------------------------------------------------------
  // Adding items
  // ---------------------------------------------------------------------------

  async function handleAdd(e) {
    e.preventDefault();
    const raw = els.input.value;
    if (!raw.trim()) return;

    const { videoId, playlistId } = parseYouTube(raw);

    if (!videoId && !playlistId) {
      showHint('Hmm, that doesn’t look like a YouTube link. Try a watch or playlist URL.');
      return;
    }

    els.input.value = '';

    if (playlistId && !videoId) {
      await addPlaylist(playlistId);
    } else if (videoId) {
      await addVideo(videoId);
    }
  }

  async function addVideo(videoId, { autoplay = true } = {}) {
    const wasEmpty = queue.length === 0;
    const meta = { id: videoId, title: 'Loading…', author: '' };
    queue.push(meta);
    saveQueue();
    renderQueue();
    showHint('Added to queue.');

    // Enrich title in the background.
    fetchMeta(videoId).then((m) => {
      meta.title = m.title;
      meta.author = m.author;
      saveQueue();
      renderQueue();
      if (queue[current] === meta) updateNowPlaying(meta);
    });

    if (wasEmpty && autoplay) playAt(0);
  }

  async function addPlaylist(playlistId) {
    showHint('Loading playlist…');
    if (!playerReady || !player) {
      // Defer until the player is ready.
      pendingPlaylist = playlistId;
      return;
    }
    // Ask YouTube to enumerate the playlist for us, then merge the IDs in.
    player.cuePlaylist({ listType: 'playlist', list: playlistId });
    // getPlaylist() populates shortly after cue; poll briefly.
    let tries = 0;
    const grab = setInterval(() => {
      tries++;
      const ids = player.getPlaylist && player.getPlaylist();
      if (ids && ids.length) {
        clearInterval(grab);
        mergePlaylistIds(ids);
      } else if (tries > 25) {
        clearInterval(grab);
        showHint('Could not read that playlist. It may be private or unavailable.');
      }
    }, 200);
  }

  function mergePlaylistIds(ids) {
    const wasEmpty = queue.length === 0;
    const existing = new Set(queue.map((q) => q.id));
    let added = 0;
    ids.forEach((id) => {
      if (!existing.has(id)) {
        const meta = { id, title: 'Loading…', author: '' };
        queue.push(meta);
        existing.add(id);
        added++;
        fetchMeta(id).then((m) => {
          meta.title = m.title;
          meta.author = m.author;
          saveQueue();
          renderQueue();
          if (queue[current] === meta) updateNowPlaying(meta);
        });
      }
    });
    saveQueue();
    renderQueue();
    showHint(`Added ${added} video${added === 1 ? '' : 's'} from playlist.`);
    if (wasEmpty && queue.length) playAt(0);
  }

  let pendingPlaylist = null;

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  function playAt(i) {
    if (i < 0 || i >= queue.length) return;
    current = i;
    renderQueue();
    const item = queue[i];
    updateNowPlaying(item);
    if (playerReady && player) {
      player.loadVideoById(item.id);
      els.placeholder.classList.add('hidden');
    }
  }

  function nextTrack(auto = false) {
    if (queue.length === 0) return;
    if (shuffle && queue.length > 1) {
      let n;
      do { n = Math.floor(Math.random() * queue.length); } while (n === current);
      playAt(n);
      return;
    }
    if (current < queue.length - 1) {
      playAt(current + 1);
    } else if (loopQueue) {
      playAt(0);
    } else if (auto) {
      isPlaying = false;
      updatePlayButton();
    }
  }

  function prevTrack() {
    if (queue.length === 0) return;
    // If we're more than 3s in, restart current track instead.
    if (player && playerReady && player.getCurrentTime && player.getCurrentTime() > 3) {
      player.seekTo(0, true);
      return;
    }
    if (current > 0) playAt(current - 1);
    else if (loopQueue) playAt(queue.length - 1);
  }

  function togglePlay() {
    if (!playerReady || !player || current < 0) {
      if (queue.length) playAt(current < 0 ? 0 : current);
      return;
    }
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  }

  function stopPlayback() {
    if (player && playerReady) player.stopVideo();
    els.placeholder.classList.remove('hidden');
    updateNowPlaying(null);
    isPlaying = false;
    updatePlayButton();
  }

  // ---------------------------------------------------------------------------
  // Now playing / Media Session
  // ---------------------------------------------------------------------------

  function updateNowPlaying(item) {
    if (!item) {
      els.npTitle.textContent = 'Nothing playing';
      els.npAuthor.textContent = '';
      return;
    }
    els.npTitle.textContent = item.title || item.id;
    els.npAuthor.textContent = item.author || '';
    setMediaSession(item);
  }

  function setMediaSession(item) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title || 'YouTube',
      artist: item.author || 'TuneStream',
      album: 'TuneStream',
      artwork: [
        { src: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
        { src: `https://i.ytimg.com/vi/${item.id}/maxresdefault.jpg`, sizes: '1280x720', type: 'image/jpeg' },
      ],
    });
  }

  function registerMediaHandlers() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action, handler) => {
      try { ms.setActionHandler(action, handler); } catch { /* unsupported action */ }
    };
    set('play', () => player && player.playVideo());
    set('pause', () => player && player.pauseVideo());
    set('previoustrack', () => prevTrack());
    set('nexttrack', () => nextTrack());
    set('seekbackward', (d) => seekBy(-(d.seekOffset || 10)));
    set('seekforward', (d) => seekBy(d.seekOffset || 10));
    set('stop', () => stopPlayback());
  }

  function seekBy(secs) {
    if (player && playerReady && player.getCurrentTime) {
      player.seekTo(Math.max(0, player.getCurrentTime() + secs), true);
    }
  }

  // ---------------------------------------------------------------------------
  // UI feedback
  // ---------------------------------------------------------------------------

  let hintTimer = null;
  function showHint(msg) {
    els.hint.textContent = msg;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { els.hint.textContent = ''; }, 4000);
  }

  function updatePlayButton() {
    els.playBtn.textContent = isPlaying ? '⏸' : '▶';
  }

  // ---------------------------------------------------------------------------
  // Picture-in-Picture
  // ---------------------------------------------------------------------------

  async function togglePiP() {
    const iframe = document.querySelector('#player iframe');
    // YouTube iframe doesn't expose the inner <video> to us (cross-origin),
    // so true PiP must be triggered from YouTube's own controls. Guide the user.
    if (document.pictureInPictureElement) {
      try { await document.exitPictureInPicture(); } catch {}
      return;
    }
    showHint('Tap the video, then use YouTube’s Picture-in-Picture / fullscreen control.');
    if (iframe) iframe.focus();
  }

  // ---------------------------------------------------------------------------
  // YouTube IFrame API wiring
  // ---------------------------------------------------------------------------

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  };

  function onPlayerReady() {
    playerReady = true;
    registerMediaHandlers();
    if (pendingPlaylist) {
      const pl = pendingPlaylist;
      pendingPlaylist = null;
      addPlaylist(pl);
    } else if (queue.length && current >= 0) {
      // Restore last session but don't autoplay (browsers block it).
      updateNowPlaying(queue[current]);
      player.cueVideoById(queue[current].id);
    }
  }

  function onPlayerStateChange(e) {
    const YTS = YT.PlayerState;
    if (e.data === YTS.PLAYING) {
      isPlaying = true;
      els.placeholder.classList.add('hidden');
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      // Sync the now-playing title with what's actually loaded.
      syncTitleFromPlayer();
    } else if (e.data === YTS.PAUSED) {
      isPlaying = false;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else if (e.data === YTS.ENDED) {
      nextTrack(true);
    }
    updatePlayButton();
  }

  function syncTitleFromPlayer() {
    if (!player || !player.getVideoData) return;
    const data = player.getVideoData();
    if (data && data.title && current >= 0 && queue[current]) {
      const item = queue[current];
      if (!item.title || item.title === 'Loading…' || item.title === item.id) {
        item.title = data.title;
        item.author = data.author || item.author;
        saveQueue();
        renderQueue();
        updateNowPlaying(item);
      }
    }
  }

  function onPlayerError(e) {
    // 100/101/150 = not embeddable or removed. Skip to next.
    const map = {
      2: 'Invalid video ID.',
      5: 'Playback error.',
      100: 'Video removed or private.',
      101: 'Owner doesn’t allow embedding — skipping.',
      150: 'Owner doesn’t allow embedding — skipping.',
    };
    showHint(map[e.data] || 'Couldn’t play that one — skipping.');
    setTimeout(() => nextTrack(true), 800);
  }

  // ---------------------------------------------------------------------------
  // Wire up controls
  // ---------------------------------------------------------------------------

  els.form.addEventListener('submit', handleAdd);
  els.playBtn.addEventListener('click', togglePlay);
  els.prevBtn.addEventListener('click', prevTrack);
  els.nextBtn.addEventListener('click', () => nextTrack());
  els.pipBtn.addEventListener('click', togglePiP);
  els.clearBtn.addEventListener('click', () => {
    queue = [];
    current = -1;
    saveQueue();
    renderQueue();
    stopPlayback();
  });
  els.shuffleBtn.addEventListener('click', () => {
    shuffle = !shuffle;
    els.shuffleBtn.classList.toggle('active', shuffle);
    showHint(shuffle ? 'Shuffle on.' : 'Shuffle off.');
  });
  els.loopBtn.addEventListener('click', () => {
    loopQueue = !loopQueue;
    els.loopBtn.classList.toggle('active', loopQueue);
    showHint(loopQueue ? 'Looping the queue.' : 'Loop off.');
  });
  els.loopBtn.classList.toggle('active', loopQueue);

  // Initial paint.
  renderQueue();
  if (current >= 0 && queue[current]) updateNowPlaying(queue[current]);

  // Load the YouTube IFrame API.
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  // Register the service worker for installable / offline app shell.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
