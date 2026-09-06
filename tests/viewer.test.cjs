const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../outputs/x-media-viewer');
const source = (name) =>
  fs.readFileSync(
    name === 'media-core.js'
      ? path.resolve(__dirname, '../work/media-core.js')
      : path.join(dir, name),
    'utf8',
  );
async function setup(body = '', viewer = false, options = {}) {
  const dom = new JSDOM(`<body><div id="react-root">${body}</div></body>`, {
    url: 'https://x.com/example/reposts#x-media-viewer',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.scrollBy = () => options.onScroll?.(w);
  w.scrollTo = () => {};
  if (options.fastLoader) {
    const timeout = w.setTimeout.bind(w);
    w.setTimeout = (callback, ms, ...args) =>
      timeout(callback, ms === 850 ? 15 : ms === 150 ? 5 : ms === 120 ? 1 : ms, ...args);
  }
  w.HTMLElement.prototype.getClientRects = () => [{ width: 1 }];
  w.HTMLMediaElement.prototype.play = () => Promise.resolve();
  w.HTMLMediaElement.prototype.pause = () => {};
  const imageSrc = Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype, 'src');
  const pendingDecodes = new Map(),
    mediaStates = new WeakMap(),
    decodedImages = new WeakSet();
  w.testMedia = {
    images: [],
    videos: [],
    loadImage(img) {
      img.dispatchEvent(new w.Event('load'));
    },
    decodeImage(img) {
      decodedImages.add(img);
      pendingDecodes.get(img)?.();
    },
    forgetImage(img) {
      decodedImages.delete(img);
    },
    setVideo(video, state) {
      mediaStates.set(video, state);
      video.dispatchEvent(new w.Event('canplay'));
    },
  };
  Object.defineProperty(w.HTMLImageElement.prototype, 'src', {
    configurable: true,
    get: imageSrc.get,
    set(value) {
      imageSrc.set.call(this, value);
      w.testMedia.images.push(this);
      if (!options.manualImages) w.queueMicrotask(() => this.dispatchEvent(new w.Event('load')));
    },
  });
  w.HTMLImageElement.prototype.decode = function () {
    return options.manualImages && !decodedImages.has(this)
      ? new Promise((resolve) => pendingDecodes.set(this, resolve))
      : Promise.resolve();
  };
  const state = (video) =>
    mediaStates.get(video) ||
    (options.manualVideos
      ? { readyState: 0, end: 0, duration: 30 }
      : { readyState: 4, end: 30, duration: 30 });
  Object.defineProperty(w.HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get() {
      return state(this).readyState;
    },
  });
  Object.defineProperty(w.HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get() {
      return state(this).duration;
    },
  });
  Object.defineProperty(w.HTMLMediaElement.prototype, 'buffered', {
    configurable: true,
    get() {
      const end = state(this).end;
      return { length: end ? 1 : 0, start: () => 0, end: () => end };
    },
  });
  Object.defineProperty(w.HTMLVideoElement.prototype, 'videoWidth', {
    configurable: true,
    get() {
      return state(this).readyState >= 2 ? 1280 : 0;
    },
  });
  w.HTMLMediaElement.prototype.load = function () {
    if (!this.hasAttribute('src')) return;
    w.testMedia.videos.push(this);
    if (!options.manualVideos) w.queueMicrotask(() => this.dispatchEvent(new w.Event('canplay')));
  };
  options.configure?.(w);
  if (!viewer) w.eval(source('media-core.js'));
  if (viewer) {
    w.eval(source('viewer.js'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  }
  await delay(0);
  return dom;
}
const image = (id, count = 1) =>
  `<article data-testid="tweet"><a href="/alice/status/${id}"><time>Today</time></a><div data-testid="tweetText">Caption ${id}</div>${Array.from({ length: count }, (_, n) => `<img alt="Photo ${n + 1}" src="https://pbs.twimg.com/media/image${id}-${n}?format=jpg&name=small">`).join('')}</article>`;
const video = (id) =>
  `<article data-testid="tweet"><a href="/bob/status/${id}"><time>Today</time></a><div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/ext_tw_video_thumb/987/pu/img/poster.jpg"><source src="blob:https://x.com/unusable"></video></div></article>`;
const key = async (w, value) => {
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  await delay(0);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail('Expected state was not reached');
}
test('media URLs reject foreign hosts, insecure URLs, and invalid video types', async () => {
  const dom = await setup(),
    c = dom.window.XMediaCore;
  for (const bad of [
    'https://pbs.twimg.com.evil.example/a.jpg',
    'http://pbs.twimg.com/media/a.jpg',
    'javascript:alert(1)',
    null,
  ])
    assert.equal(c.imageURL(bad), null);
  for (const bad of [
    'https://evil.example/a.mp4',
    'http://video.twimg.com/a.mp4',
    'https://video.twimg.com/a.m3u8',
    null,
  ])
    assert.equal(c.videoURL(bad), null);
  dom.window.close();
});
test('nested video responses select highest bitrate MP4 and reject foreign URLs', async () => {
  const dom = await setup();
  const c = dom.window.XMediaCore;
  const result = c.extractVideos({
    data: {
      entries: [
        {
          content: {
            media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/1/p.jpg',
            type: 'video',
            video_info: {
              variants: [
                null,
                {},
                {
                  content_type: 'video/mp4',
                  bitrate: 256000,
                  url: 'https://video.twimg.com/a/low.mp4',
                },
                {
                  content_type: 'application/x-mpegURL',
                  bitrate: 99999999,
                  url: 'https://video.twimg.com/a/master.m3u8',
                },
                {
                  content_type: 'video/mp4',
                  bitrate: 1000000,
                  url: 'https://video.twimg.com/a/high.mp4?tag=1',
                },
                { content_type: 'video/mp4', bitrate: 99999999, url: 'https://evil.example/a.mp4' },
              ],
            },
          },
        },
      ],
    },
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].src, 'https://video.twimg.com/a/high.mp4?tag=1');
  assert.equal(c.imageURL('https://pbs.twimg.com.evil.example/a.jpg'), null);
  dom.window.close();
});
test('up/down traverses every attachment across posts and restores X on close', async () => {
  const dom = await setup(
    image('1', 2) + '<article data-testid="tweet">Text only</article>' + image('2'),
    true,
  );
  const w = dom.window,
    root = w.document.querySelector('#x-media-viewer').shadowRoot;
  assert.match(root.querySelector('#counter').textContent, /1\/3/);
  assert.match(root.querySelector('#stage img').src, /image1-0.*name=orig/);
  await key(w, 'ArrowDown');
  assert.match(root.querySelector('#stage img').src, /image1-1/);
  assert.match(root.querySelector('#counter').textContent, /2\/3/);
  assert.equal(root.querySelector('#original').href, 'https://x.com/alice/status/1');
  await key(w, 'ArrowDown');
  assert.match(root.querySelector('#stage img').src, /image2-0/);
  await key(w, 'ArrowUp');
  assert.match(root.querySelector('#stage img').src, /image1-1/);
  await key(w, 'ArrowUp');
  assert.match(root.querySelector('#stage img').src, /image1-0/);
  assert.equal(root.querySelector('#left'), null);
  assert.equal(root.querySelector('#right'), null);
  assert.equal(w.document.querySelector('#react-root').inert, true);
  await key(w, 'Escape');
  assert.equal(w.document.querySelector('#x-media-viewer'), null);
  assert.equal(w.document.querySelector('#react-root').inert, false);
  assert.equal(w.location.hash, '');
  dom.window.close();
});
test('virtualized posts stay available and new posts append without duplicates', async () => {
  const dom = await setup(image('1'), true),
    w = dom.window;
  const root = w.document.querySelector('#x-media-viewer').shadowRoot;
  w.document.querySelector('#react-root').innerHTML = image('2') + image('3');
  await delay(180);
  assert.match(root.querySelector('#counter').textContent, /1\/3/);
  await key(w, 'ArrowDown');
  assert.match(root.querySelector('#stage img').src, /image2-0/);
  await key(w, 'ArrowUp');
  assert.match(root.querySelector('#stage img').src, /image1-0/);
  w.document
    .querySelector('#react-root')
    .append(w.document.querySelector('article').cloneNode(true));
  await delay(180);
  assert.match(root.querySelector('#counter').textContent, /1\/3/);
  dom.window.close();
});
test('a late video source replaces the preview with playable muted media', async () => {
  const dom = await setup(video('9'), true),
    w = dom.window;
  const root = w.document.querySelector('#x-media-viewer').shadowRoot;
  assert.equal(root.querySelector('#stage video'), null);
  const send = (origin, src) =>
    w.dispatchEvent(
      new w.MessageEvent('message', {
        source: w,
        origin,
        data: {
          channel: 'x-media-viewer:media',
          items: [
            { poster: 'https://pbs.twimg.com/ext_tw_video_thumb/987/pu/img/poster.jpg', src },
          ],
        },
      }),
    );
  send('https://evil.example', 'https://video.twimg.com/a/high.mp4');
  assert.equal(root.querySelector('#stage video'), null);
  send(w.location.origin, 'https://evil.example/high.mp4');
  assert.equal(root.querySelector('#stage video'), null);
  send(w.location.origin, 'https://video.twimg.com/a/high.mp4');
  await delay(0);
  assert.equal(root.querySelector('#stage video').src, 'https://video.twimg.com/a/high.mp4');
  assert.equal(root.querySelector('#stage video').muted, true);
  const button = root.querySelector('#mute');
  assert.equal(button.textContent, 'Unmute · M, E');
  for (const [shortcut, expectedMuted] of [
    ['m', false],
    ['e', true],
    ['M', false],
    ['E', true],
  ]) {
    await key(w, shortcut);
    assert.equal(root.querySelector('#stage video').muted, expectedMuted);
    assert.equal(button.textContent, expectedMuted ? 'Unmute · M, E' : 'Mute · M, E');
    assert.equal(button.getAttribute('aria-label'), expectedMuted ? 'Unmute' : 'Mute');
  }
  button.click();
  assert.equal(root.querySelector('#stage video').muted, false);
  assert.equal(button.textContent, 'Mute · M, E');
  root.querySelector('#stage video').muted = true;
  root.querySelector('#stage video').dispatchEvent(new w.Event('volumechange'));
  assert.equal(button.textContent, 'Unmute · M, E');
  dom.window.close();
});
test('next at the end scrolls X and advances to newly found media', async () => {
  const dom = await setup(image('1'), true),
    w = dom.window;
  w.scrollBy = () =>
    w.document.querySelector('#react-root').insertAdjacentHTML('beforeend', image('2'));
  await key(w, 'ArrowDown');
  await delay(950);
  const root = w.document.querySelector('#x-media-viewer').shadowRoot;
  assert.match(root.querySelector('#counter').textContent, /2\/2/);
  assert.match(root.querySelector('#stage img').src, /image2-0/);
  dom.window.close();
});
test('going back cancels a pending next request', async () => {
  const dom = await setup(image('1') + image('2'), true),
    w = dom.window;
  await key(w, 'ArrowDown');
  await key(w, 'ArrowDown');
  await key(w, 'ArrowUp');
  await delay(950);
  const root = w.document.querySelector('#x-media-viewer').shadowRoot;
  assert.match(root.querySelector('#counter').textContent, /1\/2/);
  dom.window.close();
});
test('bridge observes a response copy without consuming or changing the original', async () => {
  const dom = await setup(),
    w = dom.window;
  let copied = 0,
    sent;
  const response = {
    url: 'https://x.com/i/api/graphql/id/UserTweets',
    clone() {
      copied++;
      return {
        json: async () => ({
          media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/1/p.jpg',
          video_info: {
            variants: [
              { content_type: 'video/mp4', bitrate: 1, url: 'https://video.twimg.com/a/high.mp4' },
            ],
          },
        }),
      };
    },
  };
  w.fetch = async () => response;
  w.postMessage = (message) => {
    sent = message;
  };
  delete w.XMediaCore;
  w.eval(source('bridge.js'));
  assert.equal(await w.fetch(response.url), response);
  await delay(0);
  assert.equal(copied, 1);
  assert.equal(sent.items[0].src, 'https://video.twimg.com/a/high.mp4');
  w.history.replaceState(null, '', '/home');
  sent = undefined;
  await w.fetch(response.url);
  await delay(0);
  assert.equal(copied, 2);
  assert.equal(sent, undefined);
  w.history.replaceState(null, '', '/home#x-media-viewer');
  w.dispatchEvent(
    new w.MessageEvent('message', {
      source: w,
      origin: w.location.origin,
      data: { channel: 'x-media-viewer:ready' },
    }),
  );
  assert.equal(sent.items[0].src, 'https://video.twimg.com/a/high.mp4');
  dom.window.close();
});
test('continuous X updates do not postpone media discovery indefinitely', async () => {
  const dom = await setup('<span id="changing"></span>', true),
    w = dom.window;
  w.document.querySelector('#react-root').insertAdjacentHTML('beforeend', image('1'));
  let tick = 0;
  const updates = setInterval(() => {
    w.document.querySelector('#changing').textContent = String(++tick);
  }, 20);
  try {
    await delay(250);
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    assert.match(root.querySelector('#counter').textContent, /1\/1/);
  } finally {
    clearInterval(updates);
    dom.window.close();
  }
});
test('toolbar activation uses the visible post and restores the current page without navigating', async () => {
  const dom = await setup(image('1') + image('2')),
    w = dom.window;
  w.history.replaceState({ preserved: true }, '', '/example/reposts#existing');
  let handler;
  w.chrome = {
    runtime: {
      onMessage: {
        addListener: (value) => {
          handler = value;
        },
      },
    },
  };
  const articles = [...w.document.querySelectorAll('article')];
  articles[0].getBoundingClientRect = () => ({ top: -800, bottom: -100 });
  articles[1].getBoundingClientRect = () => ({ top: 100, bottom: 600 });
  w.eval(source('viewer.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert.equal(w.document.querySelector('#x-media-viewer'), null);
  let response;
  handler({ type: 'x-media-viewer:toggle' }, {}, (value) => {
    response = value;
  });
  await delay(0);
  assert.equal(response.ok, true);
  const root = w.document.querySelector('#x-media-viewer').shadowRoot;
  assert.match(root.querySelector('#stage img').src, /image2-0/);
  assert.equal(w.location.pathname, '/example/reposts');
  assert.equal(w.history.state.preserved, true);
  handler({ type: 'x-media-viewer:toggle' }, {}, () => {});
  assert.equal(w.document.querySelector('#x-media-viewer'), null);
  assert.equal(w.location.hash, '#existing');
  dom.window.close();
});
test('toolbar action messages only the clicked tab and never opens a new tab', async () => {
  const vm = require('node:vm');
  let handler, destination, payload;
  const chrome = {
    action: {
      onClicked: {
        addListener: (value) => {
          handler = value;
        },
      },
      setBadgeText: async () => {},
      setTitle: async () => {},
    },
    tabs: {
      sendMessage: async (id, message) => {
        destination = id;
        payload = message;
        return { ok: true };
      },
    },
  };
  vm.runInNewContext(source('background.js'), { chrome });
  await handler({ id: 42 });
  assert.equal(destination, 42);
  assert.equal(payload.type, 'x-media-viewer:toggle');
});
test('automatically buffers ten media items ahead without changing the displayed image', async () => {
  let scrolls = 0;
  const dom = await setup(image('1'), true, {
    fastLoader: true,
    onScroll(w) {
      scrolls++;
      w.document
        .querySelector('#react-root')
        .insertAdjacentHTML('beforeend', image(String(scrolls + 1)));
    },
  });
  try {
    const root = dom.window.document.querySelector('#x-media-viewer').shadowRoot;
    const displayed = root.querySelector('#stage img');
    await until(() => root.querySelector('#counter').textContent === '1/11');
    await delay(70);
    assert.equal(scrolls, 10);
    assert.equal(root.querySelector('#stage img'), displayed);
  } finally {
    dom.window.close();
  }
});
test('refills only after navigating below ten remaining items', async () => {
  let scrolls = 0;
  const dom = await setup(
    Array.from({ length: 11 }, (_, i) => image(String(i + 1))).join(''),
    true,
    {
      fastLoader: true,
      onScroll(w) {
        scrolls++;
        w.document
          .querySelector('#react-root')
          .insertAdjacentHTML('beforeend', image(String(scrolls + 11)));
      },
    },
  );
  try {
    const w = dom.window,
      root = w.document.querySelector('#x-media-viewer').shadowRoot;
    await delay(50);
    assert.equal(scrolls, 0);
    await key(w, 'ArrowDown');
    await until(() => root.querySelector('#counter').textContent === '2/12');
    await delay(70);
    assert.equal(scrolls, 1);
    assert.match(root.querySelector('#stage img').src, /image2-0/);
  } finally {
    dom.window.close();
  }
});
test('a next request joins background loading and advances only once', async () => {
  let scrolls = 0,
    supply = false,
    nextId = 2;
  const dom = await setup(image('1'), true, {
    fastLoader: true,
    onScroll(w) {
      scrolls++;
      if (supply)
        w.document
          .querySelector('#react-root')
          .insertAdjacentHTML('beforeend', image(String(nextId++)));
    },
  });
  try {
    const w = dom.window,
      root = w.document.querySelector('#x-media-viewer').shadowRoot;
    await until(() => scrolls === 1);
    await key(w, 'ArrowDown');
    await key(w, 'ArrowDown');
    assert.equal(scrolls, 1);
    supply = true;
    await until(() => root.querySelector('#counter').textContent === '2/12');
    await delay(70);
    assert.match(root.querySelector('#stage img').src, /image2-0/);
  } finally {
    dom.window.close();
  }
});
test('background loading stops at a stalled end and resumes only on an explicit retry', async () => {
  let scrolls = 0;
  const dom = await setup(image('1'), true, {
    fastLoader: true,
    onScroll() {
      scrolls++;
    },
  });
  try {
    const w = dom.window;
    await until(() => scrolls === 6);
    await delay(100);
    assert.equal(scrolls, 6);
    await key(w, 'ArrowDown');
    assert.equal(scrolls, 7);
    await key(w, 'Escape');
    await delay(80);
    assert.equal(scrolls, 7);
    assert.equal(w.document.querySelector('#x-media-viewer'), null);
  } finally {
    dom.window.close();
  }
});
test('a text-only starting viewport automatically searches for media', async () => {
  let nextId = 1;
  const dom = await setup('<article data-testid="tweet">Text only</article>', true, {
    fastLoader: true,
    onScroll(w) {
      w.document
        .querySelector('#react-root')
        .insertAdjacentHTML('beforeend', image(String(nextId++)));
    },
  });
  try {
    const root = dom.window.document.querySelector('#x-media-viewer').shadowRoot;
    await until(() => root.querySelector('#counter').textContent === '1/11');
    assert.match(root.querySelector('#stage img').src, /image1-0/);
  } finally {
    dom.window.close();
  }
});
test('mixed photos and video in one post follow the same up/down sequence', async () => {
  const player =
    '<div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/ext_tw_video_thumb/987/pu/img/poster.jpg" src="https://video.twimg.com/a/high.mp4"></video></div>';
  const mixed = image('1', 2).replace('<img alt="Photo 2"', player + '<img alt="Photo 2"');
  const dom = await setup(mixed + image('2'), true),
    w = dom.window;
  try {
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    assert.equal(root.querySelector('#counter').textContent, '1/4');
    await key(w, 'ArrowDown');
    assert.equal(root.querySelector('#stage video').src, 'https://video.twimg.com/a/high.mp4');
    assert.equal(root.querySelector('#original').href, 'https://x.com/alice/status/1');
    await key(w, 'ArrowDown');
    assert.match(root.querySelector('#stage img').src, /image1-1/);
    await key(w, 'ArrowDown');
    assert.match(root.querySelector('#stage img').src, /image2-0/);
    await key(w, 'ArrowUp');
    assert.match(root.querySelector('#stage img').src, /image1-1/);
    await key(w, 'ArrowUp');
    assert.ok(root.querySelector('#stage video'));
    await key(w, 'ArrowUp');
    assert.match(root.querySelector('#stage img').src, /image1-0/);
  } finally {
    w.close();
  }
});
test('late attachments are inserted in post order without changing the displayed media', async () => {
  const dom = await setup(image('1') + image('2'), true),
    w = dom.window;
  try {
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    await key(w, 'ArrowDown');
    const displayed = root.querySelector('#stage img');
    w.document.querySelector('article').outerHTML = image('1', 3);
    await until(() => root.querySelector('#counter').textContent === '4/4');
    assert.equal(root.querySelector('#stage img'), displayed);
    assert.equal(root.querySelector('#original').href, 'https://x.com/alice/status/2');
    await key(w, 'ArrowUp');
    assert.match(root.querySelector('#stage img').src, /image1-2/);
    await key(w, 'ArrowUp');
    assert.match(root.querySelector('#stage img').src, /image1-1/);
  } finally {
    w.close();
  }
});
test('the ten-item buffer counts attachments instead of posts', async () => {
  let scrolls = 0;
  const dom = await setup(image('1', 6) + image('2', 5), true, {
    fastLoader: true,
    onScroll(w) {
      scrolls++;
      w.document
        .querySelector('#react-root')
        .insertAdjacentHTML('beforeend', image(String(scrolls + 2)));
    },
  });
  try {
    const w = dom.window,
      root = w.document.querySelector('#x-media-viewer').shadowRoot;
    await delay(50);
    assert.equal(root.querySelector('#counter').textContent, '1/11');
    assert.equal(scrolls, 0);
    await key(w, 'ArrowDown');
    await until(() => root.querySelector('#counter').textContent === '2/12');
    await delay(70);
    assert.equal(scrolls, 1);
    assert.match(root.querySelector('#stage img').src, /image1-1/);
  } finally {
    dom.window.close();
  }
});
async function decoded(w, img) {
  w.testMedia.loadImage(img);
  w.testMedia.decodeImage(img);
  await delay(0);
}
test('a discovered image is not ready until decoded and cannot blank the current image', async () => {
  const dom = await setup(image('1') + image('2'), true, { manualImages: true }),
    w = dom.window;
  try {
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    const first = w.testMedia.images.find((img) => img.src.includes('image1-0'));
    const second = w.testMedia.images.find((img) => img.src.includes('image2-0'));
    assert.equal(root.querySelector('#counter').textContent, '0/2');
    await decoded(w, first);
    await key(w, 'ArrowDown');
    assert.equal(root.querySelector('#stage img'), first);
    assert.equal(root.querySelector('#counter').textContent, '1/2');
    w.testMedia.loadImage(second);
    await delay(0);
    assert.equal(
      root.querySelector('#stage img'),
      first,
      'Download completion alone must not replace the visual',
    );
    w.testMedia.decodeImage(second);
    await delay(0);
    assert.equal(root.querySelector('#stage img'), second);
    assert.equal(root.querySelector('#counter').textContent, '2/2');
    const requests = w.testMedia.images.length;
    await key(w, 'ArrowUp');
    assert.equal(root.querySelector('#stage img'), first);
    await key(w, 'ArrowDown');
    assert.equal(root.querySelector('#stage img'), second);
    assert.equal(
      w.testMedia.images.length,
      requests,
      'Back/forward must reuse the prepared elements',
    );
  } finally {
    w.close();
  }
});
test('ten prepared images can be traversed without starting another download', async () => {
  const dom = await setup(image('1', 11), true, { manualImages: true }),
    w = dom.window;
  try {
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    assert.equal(w.testMedia.images.length, 3, 'Preload concurrency is bounded');
    for (let n = 0; n < 11; n++) {
      const match = `/image1-${n}?`;
      await until(() => w.testMedia.images.some((img) => img.src.includes(match)));
      await decoded(
        w,
        w.testMedia.images.find((img) => img.src.includes(match)),
      );
    }
    assert.equal(root.querySelector('#counter').textContent, '1/11');
    assert.equal(root.querySelector('#buffer'), null);
    for (let n = 1; n < 11; n++) {
      const next = w.testMedia.images.find((img) => img.src.includes(`/image1-${n}?`));
      await key(w, 'ArrowDown');
      assert.equal(root.querySelector('#stage img'), next);
      assert.equal(root.querySelector('#counter').textContent, `${n + 1}/11`);
    }
    assert.equal(w.testMedia.images.length, 11);
  } finally {
    w.close();
  }
});
test('a late download cannot replace a newer navigation choice', async () => {
  const dom = await setup(image('1', 3), true, { manualImages: true }),
    w = dom.window;
  try {
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    const [first, second, third] = w.testMedia.images;
    await decoded(w, first);
    await key(w, 'ArrowDown');
    await key(w, 'ArrowDown');
    await decoded(w, second);
    assert.equal(root.querySelector('#stage img'), first);
    await decoded(w, third);
    assert.equal(root.querySelector('#stage img'), third);
    await key(w, 'ArrowUp');
    assert.equal(root.querySelector('#stage img'), second);
  } finally {
    w.close();
  }
});
test('video readiness requires decoded frames and three seconds buffered, then covers the first paint', async () => {
  const clip = video('9').replace(
    'blob:https://x.com/unusable',
    'https://video.twimg.com/a/high.mp4',
  );
  const dom = await setup(image('1') + clip, true, { manualVideos: true }),
    w = dom.window;
  try {
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    const first = root.querySelector('#stage img'),
      clipNode = w.testMedia.videos[0];
    let frame;
    clipNode.requestVideoFrameCallback = (callback) => {
      frame = callback;
    };
    await key(w, 'ArrowDown');
    for (const state of [
      { readyState: 1, end: 30, duration: 30 },
      { readyState: 2, end: 30, duration: 30 },
      { readyState: 3, end: 0.5, duration: 30 },
    ]) {
      w.testMedia.setVideo(clipNode, state);
      await delay(0);
      assert.equal(root.querySelector('#stage img'), first);
    }
    w.testMedia.setVideo(clipNode, { readyState: 3, end: 3, duration: 30 });
    await delay(0);
    assert.equal(root.querySelector('#stage video'), clipNode);
    assert.ok(
      root.querySelector('.video-cover'),
      'A decoded poster covers the video until its first painted frame',
    );
    frame();
    assert.equal(root.querySelector('.video-cover'), null);
  } finally {
    w.close();
  }
});
test('prepared assets are bounded and are released when the viewer closes', async () => {
  const dom = await setup(image('1', 30), true),
    w = dom.window;
  for (let n = 0; n < 15; n++) await key(w, 'ArrowDown');
  assert.ok(w.testMedia.images.filter((img) => img.hasAttribute('src')).length <= 13);
  await key(w, 'Escape');
  assert.equal(w.testMedia.images.filter((img) => img.hasAttribute('src')).length, 0);
  w.close();
});
test('an evicted decoded bitmap is rechecked before replacing the current image', async () => {
  const dom = await setup(image('1', 2), true, { manualImages: true }),
    w = dom.window;
  try {
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    const [first, second] = w.testMedia.images;
    await decoded(w, first);
    await decoded(w, second);
    w.testMedia.forgetImage(second);
    await key(w, 'ArrowDown');
    assert.equal(root.querySelector('#stage img'), first);
    w.testMedia.decodeImage(second);
    await delay(0);
    assert.equal(root.querySelector('#stage img'), second);
  } finally {
    w.close();
  }
});
test('a failed next image keeps the current visual and can be retried', async () => {
  const dom = await setup(image('1', 2), true, { manualImages: true }),
    w = dom.window;
  try {
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    const [first, second] = w.testMedia.images;
    await decoded(w, first);
    await key(w, 'ArrowDown');
    second.dispatchEvent(new w.Event('error'));
    second.dispatchEvent(new w.Event('error'));
    await delay(0);
    assert.equal(root.querySelector('#stage img'), first);
    assert.equal(root.querySelector('#retry').hidden, false);
    await key(w, 'r');
    const retried = w.testMedia.images.at(-1);
    assert.notEqual(retried, second);
    assert.equal(root.querySelector('#stage img'), first);
    await decoded(w, retried);
    assert.equal(root.querySelector('#stage img'), retried);
    assert.equal(root.querySelector('#retry').hidden, true);
  } finally {
    w.close();
  }
});

function timelineGeometry(w) {
  w.testScrolls = [];
  w.scrollTo = ({ top }) => {
    w.testScrolls.push(top);
    w.scrollY = top;
  };
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    const id = this.querySelector?.('time')
      ?.closest('a')
      ?.getAttribute('href')
      ?.match(/status\/(\d+)/)?.[1];
    const top = Number(id || 0) * 500 - w.scrollY;
    return { top, bottom: top + 400 };
  };
}
test('closing on an attachment returns to its containing post, not the opening position', async () => {
  const dom = await setup(image('1') + image('2', 2), true, { configure: timelineGeometry }),
    w = dom.window;
  try {
    await key(w, 'ArrowDown');
    await key(w, 'ArrowDown');
    await key(w, 'Escape');
    assert.equal(w.testScrolls.at(-1), 920);
    assert.equal(w.location.pathname, '/example/reposts');
  } finally {
    w.close();
  }
});
test('closing during a pending download returns to the displayed post', async () => {
  const dom = await setup(image('1') + image('2'), true, {
      configure: timelineGeometry,
      manualImages: true,
    }),
    w = dom.window;
  try {
    await decoded(w, w.testMedia.images[0]);
    await key(w, 'ArrowDown');
    await key(w, 'Escape');
    assert.equal(w.testScrolls.at(-1), 420);
  } finally {
    w.close();
  }
});
test('closing returns to a virtualized post and aligns its replacement card', async () => {
  const dom = await setup(image('1') + image('2'), true, { configure: timelineGeometry }),
    w = dom.window;
  try {
    await key(w, 'ArrowDown');
    w.document.querySelectorAll('article')[1].remove();
    w.scrollY = 5000;
    await key(w, 'Escape');
    assert.equal(w.testScrolls.at(-1), 920);
    w.document.querySelector('#react-root').insertAdjacentHTML('beforeend', image('2'));
    w.document.querySelectorAll('article')[1].getBoundingClientRect = () => ({
      top: 160,
      bottom: 560,
    });
    await delay(0);
    assert.equal(w.testScrolls.at(-1), 1000);
  } finally {
    w.close();
  }
});
test('closing after a route change does not scroll the new timeline', async () => {
  const dom = await setup(image('1'), true, { configure: timelineGeometry }),
    w = dom.window;
  try {
    w.history.replaceState(null, '', '/home');
    await key(w, 'Escape');
    assert.equal(w.testScrolls.length, 0);
  } finally {
    w.close();
  }
});
test('X opens and closes repeatedly, while W/S and left/right traverse flattened media', async () => {
  const dom = await setup(image('1', 2) + image('2'), true),
    w = dom.window;
  try {
    await key(w, 'x');
    assert.equal(w.document.querySelector('#x-media-viewer'), null);
    await key(w, 'X');
    const root = w.document.querySelector('#x-media-viewer').shadowRoot;
    await key(w, 's');
    assert.equal(root.querySelector('#counter').textContent, '2/3');
    await key(w, 'S');
    assert.equal(root.querySelector('#counter').textContent, '3/3');
    await key(w, 'W');
    assert.equal(root.querySelector('#counter').textContent, '2/3');
    await key(w, 'w');
    assert.equal(root.querySelector('#counter').textContent, '1/3');
    await key(w, 'ArrowRight');
    assert.equal(root.querySelector('#counter').textContent, '2/3');
    await key(w, 'ArrowRight');
    assert.equal(root.querySelector('#counter').textContent, '3/3');
    await key(w, 'ArrowLeft');
    assert.equal(root.querySelector('#counter').textContent, '2/3');
    await key(w, 'a');
    assert.equal(root.querySelector('#counter').textContent, '1/3');
    await key(w, 'd');
    assert.equal(root.querySelector('#counter').textContent, '2/3');
    await key(w, 'D');
    assert.equal(root.querySelector('#counter').textContent, '3/3');
    await key(w, 'A');
    assert.equal(root.querySelector('#counter').textContent, '2/3');
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'x', repeat: true, cancelable: true }));
    assert.ok(w.document.querySelector('#x-media-viewer'));
    await key(w, 'x');
    await key(w, 'x');
    assert.ok(w.document.querySelector('#x-media-viewer'));
  } finally {
    w.close();
  }
});
test('viewer hotkeys leave text editing, composition, and modified shortcuts alone', async () => {
  const dom = await setup(image('1'), true),
    w = dom.window;
  try {
    await key(w, 'x');
    const parent = w.document.querySelector('#react-root');
    parent.insertAdjacentHTML(
      'beforeend',
      '<input><textarea></textarea><select></select><div contenteditable="true"><span>Editor</span></div><div role="textbox">Text</div>',
    );
    for (const target of parent.querySelectorAll(
      'input, textarea, select, [contenteditable] span, [role="textbox"]',
    )) {
      for (const value of ['x', 'w', 's', 'a', 'd', 'e', 'm', 'z']) {
        const event = new w.KeyboardEvent('keydown', {
          key: value,
          bubbles: true,
          cancelable: true,
        });
        target.dispatchEvent(event);
        assert.equal(event.defaultPrevented, false);
        assert.equal(w.document.querySelector('#x-media-viewer'), null);
      }
    }
    for (const flags of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { isComposing: true },
      { repeat: true },
    ]) {
      w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'x', ...flags }));
      assert.equal(w.document.querySelector('#x-media-viewer'), null);
    }
    await key(w, 's');
    assert.equal(w.document.querySelector('#x-media-viewer'), null);
    await key(w, 'x');
    assert.ok(w.document.querySelector('#x-media-viewer'));
  } finally {
    w.close();
  }
});

test('zen mode hides interface and video controls while navigation and toggling keep working', async () => {
  const clip = video('9').replace(
    'blob:https://x.com/unusable',
    'https://video.twimg.com/a/high.mp4',
  );
  const dom = await setup(image('1') + clip, true),
    w = dom.window;
  try {
    let root = w.document.querySelector('#x-media-viewer').shadowRoot;
    const first = root.querySelector('#stage img');
    const zenButton = root.querySelector('#zen');
    assert.equal(zenButton.textContent.trim(), 'Zen · Z');
    assert.equal(root.querySelector('#fullscreen').textContent.trim(), 'Fullscreen · F');
    assert.equal(
      root.querySelector('header .navigation-hint').textContent.replace(/\s+/g, ' ').trim(),
      '1/2 ↑ ↓ ← →, WASD',
    );
    assert.equal(root.querySelector('footer .controls'), null);
    assert.equal(zenButton.getAttribute('aria-pressed'), 'false');
    zenButton.click();
    assert.equal(zenButton.getAttribute('aria-pressed'), 'true');
    assert.equal(root.querySelector('.viewer').classList.contains('zen'), true);
    assert.equal(root.querySelector('header').hidden, true);
    assert.equal(root.querySelector('footer').hidden, true);
    assert.equal(root.querySelector('#stage img'), first);
    await key(w, 's');
    const player = root.querySelector('#stage video');
    assert.equal(player.controls, false);
    await key(w, 'e');
    assert.equal(player.muted, false);
    const tab = new w.KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    root.querySelector('.viewer').dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    await key(w, 'Z');
    assert.equal(zenButton.getAttribute('aria-pressed'), 'false');
    assert.equal(root.querySelector('.viewer').classList.contains('zen'), false);
    assert.equal(root.querySelector('header').hidden, false);
    assert.equal(root.querySelector('footer').hidden, false);
    assert.equal(root.querySelector('#stage video'), player);
    assert.equal(player.controls, true);
    await key(w, 'z');
    await key(w, 'x');
    await key(w, 'x');
    root = w.document.querySelector('#x-media-viewer').shadowRoot;
    assert.equal(root.querySelector('.viewer').classList.contains('zen'), true);
    assert.equal(root.querySelector('header').hidden, true);
    await key(w, 'Escape');
    assert.equal(w.document.querySelector('#x-media-viewer'), null);
  } finally {
    w.close();
  }
});
