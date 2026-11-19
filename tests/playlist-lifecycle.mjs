import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../client.js", import.meta.url), "utf8");
const key = "channelforge.public.channels.v1";
const playlist = (name) => `#EXTM3U\n#EXTINF:-1,${name}\nhttps://example.com/${name}.mp4\n`;

function client() {
  const elements = new Map();
  const storage = new Map();
  const requests = [];
  const document = { activeElement: null };
  const element = () => ({
    attributes: new Map(), children: [], parent: null,
    contains(other) { return other === this || this.children.some(child => child.contains(other)); },
    matches(selector) { return selector === ".favorite-star" && this.favorite === true; },
    closest(selector) {
      if (selector === ".channel-row" && this.row) return this;
      if (this.matches(selector)) return this;
      return this.parent?.closest(selector) ?? null;
    },
    focus() { document.activeElement = this; },
    set textContent(value) {
      if (this.children.some(child => child.contains(document.activeElement))) document.activeElement = null;
      this.children = [];
      this.text = value;
    },
    get textContent() { return this.text; },
    value: "", hidden: false, events: {},
    classList: { toggle() {} },
    addEventListener(name, callback) { this.events[name] = callback; },
    setAttribute(name, value) { this.attributes.set(name, value); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    append(child) {
      if (child.fragment) {
        for (const nested of [...child.children]) this.append(nested);
      } else {
        child.parent = this;
        this.children.push(child);
      }
    },
    querySelector(selector) {
      if (selector === ".favorite-star") return this.children.find(child => child.favorite);
      return element();
    },
    cloneNode() {
      const row = element();
      row.row = true;
      const favorite = element();
      favorite.favorite = true;
      row.append(favorite);
      return row;
    },
    set innerHTML(value) { this.value = value; },
  });
  const video = element();
  Object.assign(video, {
    pauseCount: 0, loadCount: 0, src: "",
    pause() { this.pauseCount++; },
    removeAttribute(name) { if (name === "src") this.src = ""; },
    load() { this.loadCount++; },
    play() { return Promise.resolve(); },
  });
  elements.set("#videoPlayer", video);
  const context = vm.createContext({
    document: Object.assign(document, {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, element());
        return elements.get(selector);
      },
      createElement: element,
      createDocumentFragment: () => Object.assign(element(), { fragment: true }),
    }),
    localStorage: {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => storage.set(name, value),
      removeItem: (name) => storage.delete(name),
    },
    window: {}, AbortController, TextDecoder, TextEncoder, URL,
    setTimeout, clearTimeout,
    fetch(url, options) {
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
  });
  vm.runInContext(source, context);
  elements.get("#channelTemplate").content = { firstElementChild: element() };
  Object.defineProperty(elements.get("#groupFilter"), "innerHTML", {
    set() { this.value = "all"; },
  });
  elements.get("#groupFilter").value = "all";
  return {
    document, elements, storage, requests, video,
    run: (code) => vm.runInContext(code, context),
    load(name) {
      elements.get("#playlistText").value = "";
      elements.get("#playlistUrl").value = `https://example.com/${name}.m3u`;
      return context.loadPlaylist();
    },
    paste(name) {
      elements.get("#playlistText").value = playlist(name);
      return context.loadPlaylist();
    },
    clear() { elements.get("#clearData").events.click(); },
    names() { return JSON.parse(JSON.stringify(vm.runInContext("state.channels.map(c => c.name)", context))); },
    storedNames() { return JSON.parse(storage.get(key) || "[]").map(c => c.name); },
  };
}

function finish(request, name) { request.resolve(new Response(playlist(name))); }

test("keyboard selection restores focus to the selected channel without stealing search focus", async () => {
  const app = client();
  await app.paste("Alpha");
  const list = app.elements.get("#channelList");
  const original = list.children[0];
  original.focus();
  original.events.keydown({ target: original, key: "Enter", preventDefault() {} });
  assert.notEqual(list.children[0], original);
  assert.equal(app.document.activeElement, list.children[0]);
  const search = app.elements.get("#searchInput");
  search.focus();
  search.events.input();
  assert.equal(app.document.activeElement, search);
});

test("favorite activation restores its button or moves to Favorites when its row is removed", async () => {
  const app = client();
  await app.paste("Alpha");
  const list = app.elements.get("#channelList");
  const favorites = app.elements.get("#favoritesOnly");
  const button = () => list.children[0].querySelector(".favorite-star");
  const activate = () => {
    const focused = button();
    focused.focus();
    focused.events.click({ stopPropagation() {} });
  };

  const original = button();
  activate();
  assert.notEqual(original, button());
  assert.equal(app.document.activeElement, button());
  favorites.focus();
  favorites.events.click();
  assert.equal(app.document.activeElement, favorites);
  activate();
  assert.equal(app.document.activeElement, favorites);
  assert.equal(list.children[0].textContent, "No channels match the current filters.");
});

test("unfavoriting a focused row keeps other favorites and returns focus to the filter", async () => {
  const app = client();
  app.elements.get("#playlistText").value = playlist("Alpha") + playlist("Beta");
  await app.run("loadPlaylist()");
  const list = app.elements.get("#channelList");
  const favorites = app.elements.get("#favoritesOnly");
  const toggle = (index) => {
    const button = list.children[index].querySelector(".favorite-star");
    button.focus();
    button.events.click({ stopPropagation() {} });
  };

  toggle(0);
  toggle(1);
  favorites.focus();
  favorites.events.click();
  assert.equal(list.children.length, 2);
  const remainingId = list.children[1].getAttribute("data-channel-id");
  toggle(0);
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].querySelector(".favorite-star").getAttribute("aria-label"), "Remove Beta from favorites");
  assert.equal(list.children[0].getAttribute("data-channel-id"), remainingId);
  assert.equal(app.document.activeElement, favorites);
});

test("newer remote loads win even when an older fetch ignores cancellation", async () => {
  const app = client();
  const old = app.load("old");
  const current = app.load("current");
  assert.equal(app.requests[0].options.signal.aborted, true);
  finish(app.requests[1], "Current");
  await current;
  finish(app.requests[0], "Old");
  await old;
  assert.deepEqual(app.names(), ["Current"]);
  assert.deepEqual(app.storedNames(), ["Current"]);
  assert.equal(app.run("state.playlistLoad"), null);
});

test("Clear cancels a pending load and prevents late persistence", async () => {
  const app = client();
  await app.paste("Existing");
  const pending = app.load("old");
  app.clear();
  assert.equal(app.requests[0].options.signal.aborted, true);
  finish(app.requests[0], "Old");
  await pending;
  assert.deepEqual(app.names(), []);
  assert.equal(app.storage.has(key), false);
  assert.equal(app.run("state.playlistLoad"), null);
});

test("pasted playlists supersede downloads and ignore late errors", async () => {
  const app = client();
  const pending = app.load("old");
  await app.paste("Pasted");
  app.requests[0].reject(new Error("Old network error"));
  await pending;
  assert.deepEqual(app.names(), ["Pasted"]);
  assert.deepEqual(app.storedNames(), ["Pasted"]);
  assert.equal(app.requests[0].options.signal.aborted, true);
});

test("failure of the latest load preserves existing channels without reviving an older request", async () => {
  const app = client();
  await app.paste("Existing");
  const old = app.load("old");
  const latest = app.load("latest");
  const rejected = assert.rejects(latest, /Latest failure/);
  app.requests[1].reject(new Error("Latest failure"));
  await rejected;
  finish(app.requests[0], "Old");
  await old;
  assert.deepEqual(app.names(), ["Existing"]);
  assert.deepEqual(app.storedNames(), ["Existing"]);
  await app.paste("Retry");
  assert.deepEqual(app.names(), ["Retry"]);
});

test("an old completion cannot remove cancellation ownership from the current load", async () => {
  const app = client();
  const old = app.load("old");
  const current = app.load("current");
  finish(app.requests[0], "Old");
  await old;
  app.clear();
  assert.equal(app.requests[1].options.signal.aborted, true);
  finish(app.requests[1], "Current");
  await current;
  assert.deepEqual(app.names(), []);
  assert.equal(app.storage.has(key), false);
});

test("Clear stops direct and HLS playback, resets player labels and remains repeatable", async () => {
  const app = client();
  await app.paste("Existing");
  app.run("selectChannel(state.channels[0].id)");
  assert.equal(app.video.src, "https://example.com/Existing.mp4");
  const before = app.video.loadCount;
  app.run("globalThis.destroyed = 0; state.hls = { destroy() { destroyed++; } }");
  app.clear();
  app.clear();
  assert.equal(app.run("destroyed"), 1);
  assert.equal(app.run("state.hls"), null);
  assert.equal(app.run("state.selectedId"), "");
  assert.equal(app.video.src, "");
  assert.equal(app.video.loadCount, before + 2);
  assert.equal(app.elements.get("#nowPlaying").textContent, "Nothing selected");
  assert.equal(app.elements.get("#emptyPlayer").hidden, false);
});

test("playlist replacement stops the prior selection only after successful persistence", async () => {
  const app = client();
  await app.paste("Existing");
  app.run("selectChannel(state.channels[0].id)");
  const pending = app.load("replacement");
  assert.equal(app.video.src, "https://example.com/Existing.mp4");
  finish(app.requests[0], "Replacement");
  await pending;
  assert.equal(app.video.src, "");
  assert.equal(app.run("state.selectedId"), "");
  assert.deepEqual(app.names(), ["Replacement"]);
});

test("failed persistence preserves existing channels, storage and playback", async () => {
  const app = client();
  await app.paste("Existing");
  app.run("selectChannel(state.channels[0].id)");
  const selectedId = app.run("state.selectedId");
  const pauseCount = app.video.pauseCount;
  const loadCount = app.video.loadCount;
  app.run('localStorage.setItem = () => { throw new Error("Storage quota exceeded"); }');
  await assert.rejects(app.paste("Replacement"), /Storage quota exceeded/);
  assert.deepEqual(app.names(), ["Existing"]);
  assert.deepEqual(app.storedNames(), ["Existing"]);
  assert.equal(app.video.src, "https://example.com/Existing.mp4");
  assert.equal(app.video.pauseCount, pauseCount);
  assert.equal(app.video.loadCount, loadCount);
  assert.equal(app.run("state.selectedId"), selectedId);
  assert.equal(app.elements.get("#nowPlaying").textContent, "Existing");
  assert.equal(app.elements.get("#emptyPlayer").hidden, true);
  assert.equal(app.run("state.playlistLoad"), null);
});

test("empty and cleared search shows loaded channels rather than filtering for Untitled", async () => {
  const app = client();
  await app.paste("Existing");
  assert.equal(app.run("state.filtered.length"), 1);
  app.elements.get("#searchInput").value = "missing";
  app.elements.get("#searchInput").events.input();
  assert.equal(app.run("state.filtered.length"), 0);
  app.elements.get("#searchInput").value = "   ";
  app.elements.get("#searchInput").events.input();
  assert.equal(app.run("state.filtered.length"), 1);
});
