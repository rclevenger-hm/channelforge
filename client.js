const STORAGE_KEY = "channelforge.public.channels.v1";
const FAVORITES_KEY = "channelforge.public.favorites.v1";

const state = {
  channels: [],
  filtered: [],
  selectedId: "",
  favoritesOnly: false,
  favorites: new Set(readJson(FAVORITES_KEY, [])),
  hls: null,
};

const els = {
  sourceForm: document.querySelector("#sourceForm"),
  playlistUrl: document.querySelector("#playlistUrl"),
  playlistText: document.querySelector("#playlistText"),
  clearData: document.querySelector("#clearData"),
  favoritesOnly: document.querySelector("#favoritesOnly"),
  searchInput: document.querySelector("#searchInput"),
  groupFilter: document.querySelector("#groupFilter"),
  videoPlayer: document.querySelector("#videoPlayer"),
  emptyPlayer: document.querySelector("#emptyPlayer"),
  nowPlaying: document.querySelector("#nowPlaying"),
  visibleCount: document.querySelector("#visibleCount"),
  channelList: document.querySelector("#channelList"),
  channelTemplate: document.querySelector("#channelTemplate"),
};

init();

function init() {
  state.channels = readJson(STORAGE_KEY, []);
  bindEvents();
  renderAll();
}

function bindEvents() {
  els.sourceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadPlaylist();
  });
  els.searchInput.addEventListener("input", renderChannelList);
  els.groupFilter.addEventListener("change", renderChannelList);
  els.favoritesOnly.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    els.favoritesOnly.setAttribute("aria-pressed", String(state.favoritesOnly));
    renderChannelList();
  });
  els.clearData.addEventListener("click", () => {
    state.channels = [];
    state.selectedId = "";
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
  });
}

async function loadPlaylist() {
  const pasted = els.playlistText.value.trim();
  let text = pasted;
  if (!text && els.playlistUrl.value.trim()) {
    const response = await fetch(els.playlistUrl.value.trim(), { cache: "no-store" });
    if (!response.ok) throw new Error(`Playlist returned ${response.status}`);
    text = await response.text();
  }
  if (!text) return;
  state.channels = dedupeChannels(parseM3u(text));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.channels));
  renderAll();
}

function parseM3u(text) {
  const lines = text.split(/\r?\n/);
  const channels = [];
  let pending = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const attrs = parseAttributes(line);
      pending = {
        id: "",
        name: cleanName(line.split(",").pop() || attrs["tvg-name"] || "Untitled"),
        group: cleanName(attrs["group-title"] || "Ungrouped"),
        logo: attrs["tvg-logo"] || "",
        tvgId: attrs["tvg-id"] || "",
        url: "",
      };
      continue;
    }
    if (/^https?:\/\//i.test(line) && pending) {
      pending.url = line;
      pending.id = stableId(`${pending.name}|${pending.url}`);
      channels.push(pending);
      pending = null;
    }
  }

  return channels;
}

function parseAttributes(line) {
  const attrs = {};
  for (const match of line.matchAll(/([\w-]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeEntities(match[2]);
  }
  return attrs;
}

function dedupeChannels(channels) {
  const byKey = new Map();
  for (const channel of channels) {
    const key = normalizeUrl(channel.url) || normalizeName(channel.name);
    if (!byKey.has(key)) byKey.set(key, channel);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderAll() {
  renderGroups();
  renderChannelList();
}

function renderGroups() {
  const current = els.groupFilter.value;
  const groups = [...new Set(state.channels.map((channel) => channel.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  els.groupFilter.innerHTML = '<option value="all">All groups</option>';
  for (const group of groups) {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    els.groupFilter.append(option);
  }
  if (groups.includes(current)) els.groupFilter.value = current;
}

function renderChannelList() {
  const query = normalizeName(els.searchInput.value);
  const group = els.groupFilter.value;
  state.filtered = state.channels.filter((channel) => {
    const matchesQuery = !query || normalizeName(`${channel.name} ${channel.group}`).includes(query);
    const matchesGroup = group === "all" || channel.group === group;
    const matchesFavorite = !state.favoritesOnly || state.favorites.has(channel.id);
    return matchesQuery && matchesGroup && matchesFavorite;
  });

  els.visibleCount.textContent = `${state.filtered.length.toLocaleString()} visible`;
  els.channelList.textContent = "";
  if (!state.filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = state.channels.length ? "No channels match the current filters." : "Load a legal M3U playlist to begin.";
    els.channelList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const channel of state.filtered.slice(0, 1000)) fragment.append(createChannelRow(channel));
  els.channelList.append(fragment);
}

function createChannelRow(channel) {
  const row = els.channelTemplate.content.firstElementChild.cloneNode(true);
  const logo = row.querySelector(".channel-logo");
  const name = row.querySelector(".channel-copy strong");
  const meta = row.querySelector(".channel-copy small");
  const favorite = row.querySelector(".favorite-star");

  row.classList.toggle("is-active", channel.id === state.selectedId);
  row.classList.toggle("is-favorite", state.favorites.has(channel.id));
  logo.textContent = initials(channel.name);
  if (channel.logo) {
    const img = document.createElement("img");
    img.src = channel.logo;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      img.remove();
      logo.textContent = initials(channel.name);
    };
    logo.textContent = "";
    logo.append(img);
  }
  name.textContent = channel.name;
  meta.textContent = channel.group;
  updateFavoriteButton(favorite, channel);

  row.addEventListener("click", (event) => {
    if (event.target.closest(".favorite-star")) return;
    selectChannel(channel.id);
  });
  row.addEventListener("keydown", (event) => {
    if (event.target.closest(".favorite-star")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectChannel(channel.id);
  });
  favorite.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFavorite(channel.id);
  });
  return row;
}

function selectChannel(id) {
  const channel = state.channels.find((item) => item.id === id);
  if (!channel) return;
  state.selectedId = id;
  els.nowPlaying.textContent = channel.name;
  els.emptyPlayer.hidden = true;
  playUrl(channel.url);
  renderChannelList();
}

function playUrl(url) {
  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }
  els.videoPlayer.pause();
  els.videoPlayer.removeAttribute("src");
  if (/\.m3u8(?:[?#]|$)/i.test(url) && window.Hls?.isSupported()) {
    state.hls = new window.Hls();
    state.hls.loadSource(url);
    state.hls.attachMedia(els.videoPlayer);
    state.hls.on(window.Hls.Events.MANIFEST_PARSED, () => els.videoPlayer.play().catch(() => {}));
    return;
  }
  els.videoPlayer.src = url;
  els.videoPlayer.play().catch(() => {});
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
  renderChannelList();
}

function updateFavoriteButton(button, channel) {
  const isFavorite = state.favorites.has(channel.id);
  button.setAttribute("aria-pressed", String(isFavorite));
  button.setAttribute("aria-label", isFavorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`);
  button.title = isFavorite ? "Remove from favorites" : "Add to favorites";
}

function cleanName(value = "") {
  return decodeEntities(value).replace(/\s+/g, " ").trim() || "Untitled";
}

function normalizeName(value = "") {
  return cleanName(value).toLowerCase();
}

function normalizeUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return String(value).trim();
  }
}

function decodeEntities(value = "") {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(value);
  return textarea.value;
}

function stableId(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `ch_${Math.abs(hash).toString(36)}`;
}

function initials(value) {
  return cleanName(value)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
