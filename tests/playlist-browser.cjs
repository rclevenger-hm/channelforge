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
    await page.addInitScript({ path: 'tv/tv-remote.js' });
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
    await page.locator('#searchInput').fill('missing');
    assert.deepEqual(await names(), []);
    await page.locator('#searchInput').fill('   ');
    assert.deepEqual(await names(), ['New']);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).map(c => c.name), key), ['New']);
    await page.evaluate(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        window.playCalls = (window.playCalls ?? 0) + 1;
        return play.apply(this, args);
      };
    });
    const row = page.locator('.channel-row');
    const favorite = row.locator('.favorite-star');
    const favorites = page.locator('#favoritesOnly');
    const isFocused = (control) => control.evaluate(el => document.activeElement === el);

    await row.focus();
    for (const key of ['Enter', 'Space', 'Enter']) {
      const playCalls = await page.evaluate(() => window.playCalls ?? 0);
      await page.keyboard.press(key);
      assert.equal(await page.locator('#nowPlaying').textContent(), 'New');
      assert.equal(await isFocused(row), true, `the row retains focus after ${key}`);
      assert.equal(await page.evaluate(() => window.playCalls), playCalls + 1, `${key} activates playback only once with TV controls`);
    }
    await favorite.focus();
    await page.keyboard.press('Space');
    assert.equal(await isFocused(favorite), true);
    assert.equal(await favorite.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Enter');
    assert.equal(await isFocused(favorite), true);
    assert.equal(await favorite.getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Space');
    await favorites.focus();
    await page.keyboard.press('Space');
    assert.equal(await isFocused(favorites), true);
    await favorite.focus();
    await page.keyboard.press('Space');
    assert.equal(await row.count(), 0);
    assert.equal(await isFocused(favorites), true);
    await page.keyboard.press('Space');
    assert.equal(await row.count(), 1);

    const search = page.locator('#searchInput');
    await search.focus();
    await search.fill('New');
    assert.equal(await isFocused(search), true);
    await search.fill('');
    const group = page.locator('#groupFilter');
    await group.focus();
    await group.dispatchEvent('change');
    assert.equal(await isFocused(group), true);
    await page.locator('#playlistText').fill('#EXTM3U\n#EXTINF:-1,Alpha\nhttps://example.com/alpha.mp4\n#EXTINF:-1,Beta\nhttps://example.com/beta.mp4\n');
    await page.getByRole('button', { name: 'Load Playlist' }).click();
    const alpha = row.filter({ hasText: 'Alpha' });
    const beta = row.filter({ hasText: 'Beta' });
    await alpha.focus();
    await page.keyboard.press('Enter');
    assert.equal(await isFocused(alpha), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await isFocused(beta), true, 'TV ArrowDown moves from the restored row to the next channel');
    await alpha.locator('.favorite-star').focus();
    await page.keyboard.press('Space');
    await beta.locator('.favorite-star').focus();
    await page.keyboard.press('Space');
    await favorites.focus();
    await page.keyboard.press('Space');
    await alpha.locator('.favorite-star').focus();
    await page.keyboard.press('Space');
    assert.deepEqual(await names(), ['Beta']);
    assert.equal(await isFocused(favorites), true);
    await page.keyboard.press('Space');

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
