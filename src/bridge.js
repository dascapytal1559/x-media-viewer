import * as core from './media-core.js';
const cache = new Map();
const enabled = () => location.hash === '#x-media-viewer';
function relevant(value) {
  try {
    const u = new URL(value, location.href);
    return u.origin === location.origin && /\/graphql\//.test(u.pathname);
  } catch {
    return false;
  }
}
function publish(items) {
  if (items.length && enabled())
    window.postMessage({ channel: 'x-media-viewer:media', items }, location.origin);
}
function receive(data) {
  const items = core.extractVideos(data);
  for (const item of items) cache.set(core.key(item.poster), item);
  while (cache.size > 3000) cache.delete(cache.keys().next().value);
  publish(items);
}
// Keep only video URLs and posters in tab memory before the viewer is opened,
// so activating the current timeline does not require a page refresh.
// Observe copies of responses X already requested. Never read request headers,
// cookies or tokens, issue API requests, or change X's response objects.
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await Reflect.apply(originalFetch, this, args);
  const url = response.url || (typeof args[0] === 'string' ? args[0] : args[0]?.url);
  if (relevant(url)) {
    try {
      response
        .clone()
        .json()
        .then(receive)
        .catch(() => {});
    } catch {}
  }
  return response;
};
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function (...args) {
  this.addEventListener(
    'load',
    () => {
      if (!relevant(this.responseURL)) return;
      try {
        receive(this.responseType === 'json' ? this.response : JSON.parse(this.responseText));
      } catch {}
    },
    { once: true },
  );
  return Reflect.apply(originalSend, this, args);
};
window.addEventListener('message', (event) => {
  if (
    event.source === window &&
    event.origin === location.origin &&
    event.data?.channel === 'x-media-viewer:ready'
  )
    publish([...cache.values()]);
});
