const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { once } = require('node:events');
const { chromium } = require('playwright');

// Serve the real UI with no external media or CDN dependency. Deferred fetches
// intentionally ignore abort to exercise responses already queued for delivery.
(async () => {
  const server = createServer(async (request, response) => {
    const files = { '/': ['index.html', 'text/html'], '/client.js': ['client.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
    const entry = files[request.url];
    if (!entry) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': entry[1] });
    response.end(await readFile(entry[0]));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      const realFetch = window.fetch;
      window.playlistRequests = [];
      window.fetch = (url, options) => String(url).startsWith('https://fixture.test/')
        ? new Promise((resolve, reject) => window.playlistRequests.push({ options, resolve, reject }))
        : realFetch(url, options);
      HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () {};
      HTMLMediaElement.prototype.load = function () { this.dataset.resetCount = String(Number(this.dataset.resetCount || 0) + 1); };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const key = 'channelforge.public.channels.v1';
    const load = async (name, count) => {
      await page.locator('#playlistText').fill('');
      await page.locator('#playlistUrl').fill(`https://fixture.test/${name}`);
      await page.getByRole('button', { name: 'Load Playlist' }).click();
      await page.waitForFunction(n => window.playlistRequests.length === n, count);
    };
    const finish = (index, name) => page.evaluate(({ index, name }) => {
      window.playlistRequests[index].resolve(new Response(`#EXTM3U\n#EXTINF:-1,${name}\nhttps://example.com/${name}.mp4\n`));
    }, { index, name });
    const names = () => page.locator('.channel-copy strong').allTextContents();
    await load('old', 1);
    await load('new', 2);
    assert.equal(await page.evaluate(() => playlistRequests[0].options.signal.aborted), true);
    await finish(1, 'New');
    await page.getByText('New', { exact: true }).waitFor();
    await finish(0, 'Old');
    await page.waitForTimeout(50);
    assert.deepEqual(await names(), ['New']);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).map(c => c.name), key), ['New']);
    await page.locator('.channel-row').click();
    assert.equal(await page.locator('#nowPlaying').textContent(), 'New');
    await load('clear', 3);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await page.evaluate(() => playlistRequests[2].options.signal.aborted), true);
    await finish(2, 'Restored');
    await page.waitForTimeout(50);
    assert.deepEqual(await names(), []);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    assert.equal(await page.locator('#videoPlayer').getAttribute('src'), null);
    assert.equal(await page.locator('#nowPlaying').textContent(), 'Nothing selected');
    assert.equal(await page.locator('#emptyPlayer').isVisible(), true);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await load('cancel', 4);
    await page.locator('#playlistText').fill('#EXTM3U\n#EXTINF:-1,Pasted\nhttps://example.com/pasted.mp4\n');
    await page.getByRole('button', { name: 'Load Playlist' }).click();
    await page.getByText('Pasted', { exact: true }).waitFor();
    await page.evaluate(() => playlistRequests[3].reject(new Error('stale request')));
    await page.waitForTimeout(50);
    assert.deepEqual(await names(), ['Pasted']);
    assert.deepEqual(errors, []);
    console.log('Chromium playlist overlap, Clear, playback reset and pasted-replacement checks passed.');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
