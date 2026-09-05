export const imageURL = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'pbs.twimg.com' ? u.href : null;
  } catch {
    return null;
  }
};
export const videoURL = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      u.hostname === 'video.twimg.com' &&
      u.pathname.endsWith('.mp4')
      ? u.href
      : null;
  } catch {
    return null;
  }
};
export const key = (value) => {
  const src = imageURL(value);
  return src ? new URL(src).pathname : null;
};
export function extractVideos(json) {
  const found = new Map();
  const pending = [json];
  const seen = new WeakSet();
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    const poster = imageURL(item.media_url_https);
    if (poster && Array.isArray(item.video_info?.variants)) {
      const variants = item.video_info.variants.filter(
        (v) => v?.content_type === 'video/mp4' && videoURL(v.url),
      );
      variants.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
      if (variants.length)
        found.set(key(poster), { poster, src: variants[0].url, gif: item.type === 'animated_gif' });
    }
    for (const child of Object.values(item))
      if (child && typeof child === 'object') pending.push(child);
  }
  return [...found.values()];
}
