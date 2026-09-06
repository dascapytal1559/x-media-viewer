import styles from './viewer.css';
import template from './viewer.html';
import * as core from './media-core.js';
const videos = new Map();
const min_loaded_left = 10;
const load_step_ms = 850;
const max_load_steps = 30;
const idle_scroll_limit = 6;
const preload_parallel = 3;
const retain_behind = 2;
const video_buffer_seconds = 3;
const media_timeout_ms = 30000;
const prepared = new Map();
let preparing = 0,
  shown = null,
  priming = false,
  selectionRevision = 0;
let items = [],
  byId = new Map(),
  index = 0;
let host, shadow, stage, status, caption, author, counter, original, previous, next;
let active = false,
  zen = false,
  muted = true,
  busy = false,
  scanTimer,
  observer,
  emptyTimer;
let run = 0,
  route = '',
  oldFocus,
  startScroll = 0,
  inertElements = [];
let cancelReturn = () => {};
const timeline_top_gap = 80;
const return_timeout_ms = 2000;
let initialPostId = null,
  restoreHash = '';
let prefetchTimer = null,
  loadPaused = false,
  waitingForNext = false;
let lastWheel = 0,
  wheelAmount = 0,
  lastWheelEvent = 0,
  touchY = 0;

function collect(article) {
  const timeLink = article.querySelector('a[href*="/status/"] time')?.closest('a');
  const href = timeLink?.getAttribute('href');
  const match = href?.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!match) return null;
  const media = [],
    seen = new Set();
  for (const element of article.querySelectorAll(
    'img[src*="pbs.twimg.com/media/"], [data-testid="videoPlayer"]',
  )) {
    if (element.tagName === 'IMG') {
      const src = core.imageURL(element.getAttribute('src'));
      if (!src || seen.has(core.key(src))) continue;
      seen.add(core.key(src));
      const large = new URL(src);
      large.searchParams.set('name', 'orig');
      media.push({
        type: 'image',
        src: large.href,
        fallback: src,
        alt: element.alt || 'Post image',
      });
    } else {
      const video = element.querySelector('video');
      const poster = core.imageURL(
        video?.getAttribute('poster') || element.querySelector('img')?.getAttribute('src'),
      );
      if (!poster || seen.has(core.key(poster))) continue;
      seen.add(core.key(poster));
      const direct = core.videoURL(
        video?.currentSrc ||
          video?.getAttribute('src') ||
          video?.querySelector('source')?.getAttribute('src'),
      );
      media.push({ type: 'video', poster, direct });
    }
  }
  if (!media.length) return null;
  return {
    id: match[2],
    url: `https://x.com/${match[1]}/status/${match[2]}`,
    author: '@' + match[1],
    text: article.querySelector('[data-testid="tweetText"]')?.textContent || '',
    top: article.getBoundingClientRect().top + window.scrollY,
    media,
  };
}
function scan() {
  if (!active) return;
  const before = items.length;
  const wasEmpty = before === 0;
  const current = items[index];
  let changed = false;
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const post = collect(article);
    if (!post) continue;
    const existing = byId.get(post.id);
    if (existing) {
      existing.top = post.top;
      // Keep complete attachments if X temporarily renders only a placeholder.
      if (
        post.media.length >= existing.media.length &&
        JSON.stringify(post.media) !== JSON.stringify(existing.media)
      ) {
        existing.media = post.media;
        changed = true;
      }
    } else {
      byId.set(post.id, post);
      changed = true;
    }
  }
  if (changed) {
    items = [...byId.values()].flatMap((post) =>
      post.media.map((media) => ({
        id: `${post.id}:${media.type}:${core.key(media.poster || media.src)}`,
        post,
        media,
      })),
    );
    // Late attachments can insert before the current item. Keep the same media
    // selected, rather than letting its old numeric position jump to another.
    if (current) {
      const preserved = items.findIndex((item) => item.id === current.id);
      index = preserved >= 0 ? preserved : Math.min(index, items.length - 1);
    }
  }
  if (wasEmpty && items.length && initialPostId) {
    const preferred = items.findIndex((item) => item.post.id === initialPostId);
    if (preferred >= 0) index = preferred;
    initialPostId = null;
  }
  let currentChanged =
    current &&
    (current.id !== items[index]?.id ||
      JSON.stringify(current.media) !== JSON.stringify(items[index]?.media));
  if (items.length > before) loadPaused = false;
  if (waitingForNext && items.length && (wasEmpty || index < items.length - 1)) {
    waitingForNext = false;
    if (!wasEmpty) index++;
    currentChanged = true;
  }
  if ((wasEmpty && items.length) || currentChanged) render();
  else if (items.length) updateControls();
  ensureAhead();
}
function say(text) {
  if (status) status.textContent = text;
}
function updateControls() {
  const shownIndex = shown ? items.findIndex((item) => item.id === shown.id) : -1;
  counter.textContent = `${shownIndex + 1}/${items.length}`;
  previous.disabled = !items[index] || index === 0;
  next.disabled = waitingForNext && index >= items.length - 1;
}
function mediaSource(entry) {
  return entry.media.type === 'image'
    ? entry.media.src
    : videos.get(core.key(entry.media.poster))?.src || entry.media.direct || '';
}
function dispose(record) {
  record.cancel?.();
  record.state = 'disposed';
  for (const node of [record.node, record.cover]) {
    if (!node) continue;
    node.onload = node.onerror = null;
    if (node.tagName === 'VIDEO') node.pause();
    node.removeAttribute('src');
    if (node.tagName === 'VIDEO') node.load();
    node.remove();
  }
}
function videoReady(video) {
  if (video.readyState < 3 || video.videoWidth === 0) return false;
  const target = Math.min(
    video_buffer_seconds,
    Number.isFinite(video.duration)
      ? Math.max(0, video.duration - video.currentTime - 0.05)
      : video_buffer_seconds,
  );
  for (let n = 0; n < video.buffered.length; n++) {
    if (
      video.buffered.start(n) <= video.currentTime + 0.05 &&
      video.buffered.end(n) - video.currentTime >= target
    )
      return true;
  }
  return false;
}
function startPreparing(record) {
  if (record.state !== 'queued') return;
  record.state = 'loading';
  preparing++;
  let completed = false;
  const timer = setTimeout(() => finish(false), media_timeout_ms);
  function finish(ok, canceled = false) {
    if (completed) return;
    completed = true;
    clearTimeout(timer);
    preparing--;
    record.state = canceled ? 'disposed' : ok ? 'ready' : 'error';
    if (!active || canceled) return;
    primeMedia();
    if (items[index]?.id === record.id && shown !== record) presentSelected();
    updateControls();
  }
  record.cancel = () => finish(false, true);
  if (record.entry.media.type === 'image') {
    const img = (record.node = document.createElement('img'));
    img.alt = record.entry.media.alt;
    img.decoding = 'async';
    img.fetchPriority = record.id === items[index]?.id ? 'high' : 'low';
    const fallback = record.entry.media.fallback;
    let usedFallback = false;
    const fail = () => {
      if (completed) return;
      if (!usedFallback && fallback && fallback !== img.src) {
        usedFallback = true;
        img.src = fallback;
      } else finish(false);
    };
    img.onload = () =>
      img
        .decode()
        .then(() => finish(true))
        .catch(fail);
    img.onerror = fail;
    img.src = record.src;
  } else {
    const video = (record.node = document.createElement('video'));
    const poster = (record.cover = document.createElement('img'));
    let posterReady = false;
    const check = () => {
      if (posterReady && videoReady(video)) finish(true);
    };
    poster.alt = 'Video preview';
    poster.className = 'video-cover';
    poster.onload = () =>
      poster
        .decode()
        .then(() => {
          posterReady = true;
          check();
        })
        .catch(() => finish(false));
    poster.onerror = () => finish(false);
    poster.src = record.entry.media.poster;
    video.controls = !zen;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.poster = record.entry.media.poster;
    video.setAttribute('aria-label', `Video by ${record.entry.post.author}`);
    for (const event of ['loadeddata', 'loadedmetadata', 'progress', 'canplay', 'canplaythrough'])
      video.addEventListener(event, check);
    video.onerror = () => {
      if (!completed) finish(false);
      else {
        record.state = 'error';
        if (active && items[index]?.id === record.id) presentSelected();
        if (active) updateControls();
      }
    };
    video.onvolumechange = () => {
      if (shown !== record || !active) return;
      muted = video.muted;
      updateMuteButton();
    };
    video.src = record.src;
    video.load();
  }
}
function primeMedia() {
  if (!active || priming) return;
  priming = true;
  try {
    const ordered = [
      items[index],
      ...items.slice(index + 1, index + min_loaded_left + 1),
      ...items.slice(Math.max(0, index - retain_behind), index).reverse(),
    ].filter(Boolean);
    const keep = new Set(ordered.map((entry) => entry.id));
    if (shown) keep.add(shown.id);
    for (const [id, record] of prepared)
      if (!keep.has(id)) {
        dispose(record);
        prepared.delete(id);
      }
    for (const entry of ordered) {
      const src = mediaSource(entry);
      let record = prepared.get(entry.id);
      if (!record || record.src !== src) {
        if (record && record !== shown) dispose(record);
        record = { id: entry.id, entry, src, state: src ? 'queued' : 'waiting' };
        prepared.set(entry.id, record);
      }
    }
    // A newly selected item must not wait behind three background downloads.
    const selected = prepared.get(items[index]?.id);
    if (selected?.state === 'queued') startPreparing(selected);
    for (const entry of ordered) {
      if (preparing >= preload_parallel) break;
      const record = prepared.get(entry.id);
      if (record.state === 'queued') startPreparing(record);
    }
  } finally {
    priming = false;
  }
}
function clearStage() {
  stage.querySelectorAll('video').forEach((video) => video.pause());
  stage.replaceChildren();
  shown = null;
}
function presentSelected() {
  if (!active) return;
  const entry = items[index],
    record = prepared.get(entry?.id);
  if (!record || !entry) return;
  if (record.state !== 'ready') {
    shadow.querySelector('#retry').hidden = record.state !== 'error';
    say(
      record.state === 'error'
        ? `Item ${index + 1} could not load. Press R to retry or ↓ to skip.`
        : record.state === 'waiting'
          ? `Waiting for X’s video source for item ${index + 1}. You can press ↓ to skip.`
          : `Preparing item ${index + 1}…`,
    );
    updateControls();
    return;
  }
  shadow.querySelector('#retry').hidden = true;
  if (shown === record) {
    say('');
    updateControls();
    return;
  }
  if (record.node.tagName === 'IMG' && record.verifiedRevision !== selectionRevision) {
    // Chrome may discard an offscreen decoded bitmap under memory pressure.
    // Confirm it is paintable again while the old visual is still on screen.
    const revision = selectionRevision;
    if (record.verifyingRevision === revision) return;
    record.verifyingRevision = revision;
    record.node
      .decode()
      .then(() => {
        if (!active || revision !== selectionRevision || prepared.get(entry.id) !== record) return;
        record.verifiedRevision = revision;
        presentSelected();
      })
      .catch(() => {
        if (!active || revision !== selectionRevision || prepared.get(entry.id) !== record) return;
        record.state = 'error';
        presentSelected();
      });
    return;
  }
  if (record.node.tagName === 'VIDEO' && !videoReady(record.node)) {
    dispose(record);
    prepared.delete(record.id);
    primeMedia();
    presentSelected();
    return;
  }
  // Reuse the decoded image or buffered video. The previous visual remains
  // untouched until this point; stale downloads can never replace it.
  const previousRecord = shown;
  if (previousRecord?.node?.tagName === 'VIDEO') previousRecord.node.pause();
  shown = record;
  if (record.node.tagName === 'VIDEO') {
    const video = record.node;
    video.muted = muted;
    video.controls = !zen;
    stage.replaceChildren(video, record.cover);
    const reveal = () => {
      if (active && shown === record) record.cover.remove();
    };
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(reveal);
    else
      video.addEventListener(
        'playing',
        () => requestAnimationFrame(() => requestAnimationFrame(reveal)),
        { once: true },
      );
    video.play().catch(() => {
      if (active && shown === record) say('Press Space or click Play to start the video.');
    });
  } else stage.replaceChildren(record.node);
  author.textContent = entry.post.author;
  caption.textContent = entry.post.text;
  caption.hidden = !entry.post.text;
  original.href = entry.post.url;
  original.hidden = false;
  say('');
  updateControls();
  if (previousRecord && prepared.get(previousRecord.id) !== previousRecord) dispose(previousRecord);
  primeMedia();
}
function retryMedia() {
  const entry = items[index];
  if (!entry) return;
  const record = prepared.get(entry.id);
  if (record && record !== shown) dispose(record);
  prepared.delete(entry.id);
  render();
}
function render() {
  selectionRevision++;
  if (!shown && !stage.querySelector('.empty')) {
    const box = document.createElement('div');
    box.className = 'empty';
    const title = document.createElement('h1');
    title.textContent = 'Just the media.';
    const detail = document.createElement('p');
    detail.textContent = 'Preparing photos and videos…';
    const button = document.createElement('button');
    button.textContent = 'Look further down';
    button.onclick = () => loadMore(false);
    box.append(title, detail, button);
    stage.replaceChildren(box);
  }
  const lookFurther = stage.querySelector('.empty button');
  if (lookFurther) lookFurther.hidden = items.length > 0;
  primeMedia();
  presentSelected();
  updateControls();
}
function discoveredLeft() {
  return Math.max(0, items.length - index - 1);
}
function ensureAhead() {
  primeMedia();
  if (!active || busy || loadPaused || prefetchTimer || discoveredLeft() >= min_loaded_left) return;
  if (!items.length && !document.querySelector('article[data-testid="tweet"]')) return;
  prefetchTimer = setTimeout(() => {
    prefetchTimer = null;
    if (active && !busy && !loadPaused && discoveredLeft() < min_loaded_left) loadMore(false);
  }, 150);
}
async function loadMore(advance) {
  if (!active) return;
  if (advance) {
    waitingForNext = true;
    say('Loading the next image or video…');
  }
  if (busy) {
    updateControls();
    return;
  }
  clearTimeout(prefetchTimer);
  prefetchTimer = null;
  loadPaused = false;
  const token = ++run;
  busy = true;
  updateControls();
  if (!items.length) say('Looking further down the page for media…');
  try {
    let idleSteps = 0;
    for (let step = 0; step < max_load_steps && active && token === run; step++) {
      scan();
      if (discoveredLeft() >= min_loaded_left) break;
      const previousY = window.scrollY,
        previousCount = items.length;
      window.scrollBy({ top: Math.max(500, window.innerHeight * 0.8), behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, load_step_ms));
      if (!active || token !== run) return;
      scan();
      idleSteps =
        window.scrollY === previousY && items.length === previousCount ? idleSteps + 1 : 0;
      if (idleSteps >= idle_scroll_limit) break;
    }
    if (!active || token !== run) return;
    scan();
    loadPaused = discoveredLeft() < min_loaded_left;
    if (waitingForNext || !items.length) {
      waitingForNext = false;
      say(
        'No more media loaded. X may have reached the end or paused loading. Press ↓ to try again, or Esc to check X.',
      );
    }
  } finally {
    if (token === run) {
      busy = false;
      if (active) {
        updateControls();
        ensureAhead();
      }
    }
  }
}
function move(delta) {
  if (delta < 0 && index > 0) {
    waitingForNext = false;
    index--;
    render();
    ensureAhead();
  } else if (delta > 0 && index < items.length - 1) {
    waitingForNext = false;
    index++;
    render();
    ensureAhead();
  } else if (delta > 0) loadMore(true);
}
function updateMuteButton() {
  const button = shadow.querySelector('#mute');
  // Static labels: highlight shortcuts without changing the word’s casing.
  button.innerHTML = muted
    ? 'Un<span class="hotkey">m</span>ut<span class="hotkey">e</span>'
    : '<span class="hotkey">M</span>ut<span class="hotkey">e</span>';
  button.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
}
function mute() {
  muted = !muted;
  const video = stage.querySelector('video');
  if (video) video.muted = muted;
  updateMuteButton();
}
function playPause() {
  const video = stage.querySelector('video');
  if (video) {
    if (video.paused) video.play().catch(() => say('Click Play to start the video.'));
    else video.pause();
  }
}
function pauseBackground(event) {
  if (active && event.target?.tagName === 'VIDEO' && !event.composedPath().includes(host))
    event.target.pause();
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await host.requestFullscreen();
    say('');
  } catch {
    say('Fullscreen is unavailable here. The viewer still fills this tab.');
  }
}
function applyZen() {
  const viewer = shadow.querySelector('.viewer');
  viewer.classList.toggle('zen', zen);
  shadow.querySelector('#zen').setAttribute('aria-pressed', String(zen));
  shadow.querySelector('header').hidden = zen;
  shadow.querySelector('footer').hidden = zen;
  for (const record of prepared.values())
    if (record.node?.tagName === 'VIDEO') record.node.controls = !zen;
  if (shown?.node?.tagName === 'VIDEO') shown.node.controls = !zen;
  viewer.focus({ preventScroll: true });
}
function toggleZen() {
  zen = !zen;
  applyZen();
}
function keydown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (
    event
      .composedPath()
      .some(
        (node) =>
          node.isContentEditable ||
          node.matches?.(
            'input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])',
          ),
      )
  )
    return;
  const key = event.key.toLowerCase();
  if (key === 'x') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) toggle();
    return;
  }
  if (!active) return;
  const actions = {
    a: () => move(-1),
    d: () => move(1),
    arrowright: () => move(1),
    arrowleft: () => move(-1),
    arrowdown: () => move(1),
    j: () => move(1),
    s: () => move(1),
    arrowup: () => move(-1),
    k: () => move(-1),
    w: () => move(-1),
    ' ': playPause,
    e: mute,
    m: mute,
    z: toggleZen,
    f: fullscreen,
    r: retryMedia,
    escape: close,
  };
  if (actions[key]) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) actions[key]();
  }
}
function returnToPost(post, returnRoute) {
  cancelReturn();
  if (active || location.pathname + location.search !== returnRoute) return;
  if (!post) {
    window.scrollTo({ top: startScroll, behavior: 'instant' });
    return;
  }
  let watcher, timer;
  const stop = () => {
    watcher?.disconnect();
    clearTimeout(timer);
    for (const event of ['wheel', 'touchstart', 'keydown'])
      window.removeEventListener(event, stop, true);
  };
  cancelReturn = stop;
  const align = () => {
    if (active || location.pathname + location.search !== returnRoute) {
      stop();
      return true;
    }
    const article = [...document.querySelectorAll('article[data-testid="tweet"]')].find((node) => {
      const href = node
        .querySelector('a[href*="/status/"] time')
        ?.closest('a')
        ?.getAttribute('href');
      return href?.match(/^\/[^/]+\/status\/(\d+)/)?.[1] === post.id;
    });
    if (!article) return false;
    window.scrollTo({
      top: Math.max(0, window.scrollY + article.getBoundingClientRect().top - timeline_top_gap),
      behavior: 'instant',
    });
    stop();
    return true;
  };
  if (align()) return;
  // X virtualizes older cards. Returning to their last known position lets
  // X render them again; align to the real card as soon as it appears.
  watcher = new MutationObserver(align);
  watcher.observe(document.body, { childList: true, subtree: true });
  timer = setTimeout(stop, return_timeout_ms);
  for (const event of ['wheel', 'touchstart', 'keydown'])
    window.addEventListener(event, stop, true);
  window.scrollTo({ top: Math.max(0, post.top - timeline_top_gap), behavior: 'instant' });
  align();
}
function close() {
  if (!active) return;
  active = false;
  run++;
  busy = false;
  waitingForNext = false;
  observer?.disconnect();
  clearTimeout(scanTimer);
  clearTimeout(emptyTimer);
  clearTimeout(prefetchTimer);
  scanTimer = prefetchTimer = null;
  document.removeEventListener('play', pauseBackground, true);
  const fullscreenExit =
    document.fullscreenElement === host ? document.exitFullscreen().catch(() => {}) : null;
  const retired = shown;
  const returnPost = retired?.entry.post;
  const returnRoute = route,
    returnRun = run;
  clearStage();
  if (retired && prepared.get(retired.id) !== retired) dispose(retired);
  for (const record of prepared.values()) dispose(record);
  prepared.clear();
  host.remove();
  for (const element of inertElements) if (element.isConnected) element.inert = false;
  inertElements = [];
  if (location.hash === '#x-media-viewer')
    history.replaceState(
      history.state,
      '',
      location.pathname +
        location.search +
        (route === location.pathname + location.search ? restoreHash : ''),
    );
  if (location.pathname + location.search === returnRoute)
    oldFocus?.focus?.({ preventScroll: true });
  const restore = () => {
    if (run === returnRun) returnToPost(returnPost, returnRoute);
  };
  if (fullscreenExit) fullscreenExit.then(restore);
  else restore();
}
function open() {
  if (active || location.hash !== '#x-media-viewer' || !document.body) return;
  cancelReturn();
  const candidates = [...document.querySelectorAll('article[data-testid="tweet"]')]
    .map((article) => ({ post: collect(article), rect: article.getBoundingClientRect() }))
    .filter((item) => item.post);
  const current =
    candidates.find((item) => item.rect.bottom > 80 && item.rect.top < window.innerHeight) ||
    candidates.find((item) => item.rect.top >= 0) ||
    candidates.at(-1);
  initialPostId = current?.post.id || null;
  active = true;
  route = location.pathname + location.search;
  startScroll = window.scrollY;
  loadPaused = waitingForNext = false;
  items = [];
  byId = new Map();
  index = 0;
  oldFocus = document.activeElement;
  host = document.createElement('div');
  host.id = 'x-media-viewer';
  host.style.cssText =
    'position:fixed!important;inset:0!important;z-index:2147483647!important;background:#08090b!important;color-scheme:dark!important';
  shadow = host.attachShadow({ mode: 'open' });
  // This static template contains no post content. Untrusted text uses textContent.
  shadow.innerHTML = `<style>${styles}</style>${template}`;
  document.body.append(host);
  const $ = (id) => shadow.querySelector('#' + id);
  stage = $('stage');
  status = $('status');
  caption = $('caption');
  author = $('author');
  counter = $('counter');
  original = $('original');
  previous = $('previous');
  next = $('next');
  previous.onclick = () => move(-1);
  next.onclick = () => move(1);
  $('retry').onclick = retryMedia;
  $('mute').onclick = mute;
  $('zen').onclick = toggleZen;
  $('fullscreen').onclick = fullscreen;
  $('close').onclick = close;
  updateMuteButton();
  // Keep keyboard focus inside the viewer while allowing X to load underneath.
  for (const element of document.body.children)
    if (element !== host && !element.inert) {
      element.inert = true;
      inertElements.push(element);
    }
  applyZen();
  shadow.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    if (zen) {
      event.preventDefault();
      shadow.querySelector('.viewer').focus({ preventScroll: true });
      return;
    }
    const controls = [
      ...shadow.querySelectorAll('button:not(:disabled),a[href],video[controls]'),
    ].filter((e) => !e.hidden && e.getClientRects().length);
    const first = controls[0],
      last = controls.at(-1);
    if (
      event.shiftKey &&
      (shadow.activeElement === first || shadow.activeElement?.classList.contains('viewer'))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && shadow.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  host.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.composedPath().includes(caption)) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelEvent > 180) wheelAmount = 0;
      lastWheelEvent = now;
      if (now - lastWheel < 650) return;
      wheelAmount +=
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      if (Math.abs(wheelAmount) >= 70) {
        move(Math.sign(wheelAmount));
        wheelAmount = 0;
        lastWheel = now;
      }
    },
    { passive: false },
  );
  stage.addEventListener(
    'touchstart',
    (event) => {
      touchY = event.changedTouches[0].clientY;
    },
    { passive: true },
  );
  stage.addEventListener(
    'touchend',
    (event) => {
      const diff = touchY - event.changedTouches[0].clientY;
      if (Math.abs(diff) > 70) move(Math.sign(diff));
    },
    { passive: true },
  );
  document.addEventListener('play', pauseBackground, true);
  observer = new MutationObserver(() => {
    if (!scanTimer)
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scan();
      }, 120);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'poster'],
  });
  document.querySelectorAll('video').forEach((video) => video.pause());
  render();
  scan();
  emptyTimer = setTimeout(() => {
    if (active && !items.length)
      say(
        'No media is visible yet. Use “Look further down”, or press Esc to check whether X needs you to sign in.',
      );
  }, 12000);
  window.postMessage({ channel: 'x-media-viewer:ready' }, location.origin);
}
window.addEventListener('message', (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.channel !== 'x-media-viewer:media' ||
    !Array.isArray(event.data.items)
  )
    return;
  let changed = false;
  for (const item of event.data.items.slice(0, 3000)) {
    const poster = core.imageURL(item?.poster),
      src = core.videoURL(item?.src);
    if (!poster || !src) continue;
    if (videos.get(core.key(poster))?.src !== src) {
      videos.set(core.key(poster), { src, poster });
      changed = true;
    }
  }
  while (videos.size > 3000) videos.delete(videos.keys().next().value);
  if (active && changed) {
    primeMedia();
    if (items[index]?.media.type === 'video') presentSelected();
    updateControls();
  }
});
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', open, { once: true });
else open();
function toggle() {
  if (active) close();
  else {
    restoreHash = location.hash === '#x-media-viewer' ? '' : location.hash;
    // replaceState keeps the timeline and scroll position intact.
    history.replaceState(
      history.state,
      '',
      location.pathname + location.search + '#x-media-viewer',
    );
    open();
  }
}
window.addEventListener('keydown', keydown, true);
globalThis.chrome?.runtime?.onMessage?.addListener((message, sender, respond) => {
  if (message?.type !== 'x-media-viewer:toggle') return;
  toggle();
  respond({ ok: true });
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#x-media-viewer') open();
  else close();
});
setInterval(() => {
  if (active && route !== location.pathname + location.search) close();
}, 1000);
