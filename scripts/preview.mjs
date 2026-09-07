// Local rendering of the actual viewer markup/styles with original demo art.
// This provides listing screenshots, not a substitute for live extension tests.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const markup = await readFile(path.join(root, 'src/viewer.html'), 'utf8');
const css = await readFile(path.join(root, 'src/viewer.css'), 'utf8');
const scene = await readFile(path.join(root, 'assets/demo-landscape.svg'));
const html = `<!doctype html><html><head><meta charset="utf-8"><title>X Media Viewer — demo artwork</title><style>body{margin:0;background:#08090b}</style></head><body><div id="preview"></div><script>
const root=document.querySelector('#preview').attachShadow({mode:'open'});
root.innerHTML=${JSON.stringify('<style>' + css + '</style>' + markup)};
root.querySelector('#counter').textContent='1/12';
root.querySelector('#author').textContent='Demo artwork';
root.querySelector('#caption').textContent='Still water, distant peaks. Original illustration for X Media Viewer.';
const image=document.createElement('img'); image.src='/scene.svg'; image.alt='Original illustration of a mountain lake at sunset'; root.querySelector('#stage').append(image);
const viewer=root.querySelector('.viewer');
function zen(){const on=viewer.classList.toggle('zen');root.querySelector('header').hidden=on;root.querySelector('footer').hidden=on;root.querySelector('#zen').setAttribute('aria-pressed',String(on));viewer.focus();}
root.querySelector('#zen').onclick=zen;
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='z')zen();});
viewer.focus();
</script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/scene.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(scene);
    return;
  }
  if (req.url !== '/') {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
server.listen(0, '127.0.0.1', () =>
  console.log(`Listing preview: http://127.0.0.1:${server.address().port}/`),
);
