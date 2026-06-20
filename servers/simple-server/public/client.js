const elements = {
  albumSelect: document.querySelector("#albumSelect"),
  caption: document.querySelector("#caption"),
  duration: document.querySelector("#duration"),
  empty: document.querySelector("#empty"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  loadButton: document.querySelector("#loadButton"),
  nextButton: document.querySelector("#nextButton"),
  photo: document.querySelector("#photo"),
  playButton: document.querySelector("#playButton"),
  playlistUrl: document.querySelector("#playlistUrl"),
  previousButton: document.querySelector("#previousButton"),
  shell: document.querySelector("#shell"),
  status: document.querySelector("#status"),
  title: document.querySelector("#title")
};

let albums = [];
let slides = [];
let currentIndex = -1;
let timer = null;
let playing = true;
let activePlaylistUrl = new URL("/snaps.m3u8", window.location.href).href;
let defaultDuration = 15;

const requestedPlaylist = new URLSearchParams(window.location.search).get("playlist");
elements.playlistUrl.value = requestedPlaylist
  ? new URL(requestedPlaylist, window.location.href).href
  : activePlaylistUrl;

elements.loadButton.addEventListener("click", () => {
  loadPlaylist(elements.playlistUrl.value);
});
elements.playButton.addEventListener("click", () => {
  playing = !playing;
  elements.playButton.textContent = playing ? "Pause" : "Play";
  scheduleNext();
});
elements.previousButton.addEventListener("click", () => showSlide(currentIndex - 1));
elements.nextButton.addEventListener("click", () => showSlide(currentIndex + 1));
elements.fullscreenButton.addEventListener("click", () => {
  toggleFullscreen();
});
elements.albumSelect.addEventListener("change", () => {
  const album = albums[elements.albumSelect.selectedIndex];
  if (album) {
    loadPlaylist(album.url);
  }
});
elements.duration.addEventListener("change", () => {
  scheduleNext();
});
document.addEventListener("fullscreenchange", updateFullscreenState);

loadPlaylist(elements.playlistUrl.value);

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await elements.shell.requestFullscreen();
    }
  } catch (error) {
    setStatus(`Full screen failed: ${error.message}`);
  }
}

function updateFullscreenState() {
  const isFullscreen = document.fullscreenElement === elements.shell;
  elements.shell.classList.toggle("is-fullscreen", isFullscreen);
  elements.fullscreenButton.textContent = isFullscreen ? "Exit Full Screen" : "Full Screen";
}

async function loadPlaylist(url) {
  stopTimer();
  setStatus("Loading");

  const playlistUrl = new URL(url, window.location.href).href;
  const response = await fetch(playlistUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Playlist returned ${response.status}`);
  }

  activePlaylistUrl = playlistUrl;
  elements.playlistUrl.value = activePlaylistUrl;
  const playlist = parseM3u(await response.text(), activePlaylistUrl);

  if (playlist.type === "INDEX") {
    albums = playlist.entries;
    renderAlbums();
    if (albums[0]) {
      await loadPlaylist(albums[0].url);
    } else {
      slides = [];
      showEmpty("No albums found");
    }
    return;
  }

  if (playlist.type === "IMAGE") {
    slides = [chooseImageVariant(playlist.entries)];
  } else {
    slides = await resolveAlbumEntries(playlist);
  }

  defaultDuration = playlist.defaultDuration ?? Number(elements.duration.value) ?? 15;
  if (playlist.defaultDuration) {
    elements.duration.value = String(playlist.defaultDuration);
  }

  currentIndex = -1;
  setStatus(`${slides.length} photo${slides.length === 1 ? "" : "s"}`);
  showSlide(0);
}

async function resolveAlbumEntries(playlist) {
  const resolved = [];

  for (const entry of playlist.entries) {
    if (entry.url.pathname.toLowerCase().endsWith(".m3u8")) {
      try {
        const response = await fetch(entry.url, { cache: "no-cache" });
        if (!response.ok) {
          continue;
        }
        const imagePlaylist = parseM3u(await response.text(), entry.url.href);
        const variant = chooseImageVariant(imagePlaylist.entries);
        resolved.push({ ...entry, url: variant.url });
      } catch {
        continue;
      }
    } else {
      resolved.push(entry);
    }
  }

  return resolved;
}

function parseM3u(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  const playlist = {
    defaultDuration: null,
    entries: [],
    type: null
  };
  let pending = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("#EXT-X-SNAPS-TYPE:")) {
      playlist.type = line.slice("#EXT-X-SNAPS-TYPE:".length).trim().toUpperCase();
    } else if (line.startsWith("#EXT-X-SNAPS-DEFAULT-DURATION:")) {
      playlist.defaultDuration = Number(line.slice("#EXT-X-SNAPS-DEFAULT-DURATION:".length).trim());
    } else if (line.startsWith("#EXTINF:")) {
      pending = { ...pending, ...parseExtInf(line) };
    } else if (line.startsWith("#EXT-X-SNAPS-CAPTION:")) {
      pending.caption = line.slice("#EXT-X-SNAPS-CAPTION:".length).trim();
    } else if (line.startsWith("#EXT-X-SNAPS-IMAGE:")) {
      pending.image = parseAttributes(line.slice("#EXT-X-SNAPS-IMAGE:".length));
    } else if (!line.startsWith("#")) {
      playlist.entries.push({
        caption: pending.caption ?? "",
        duration: pending.duration,
        image: pending.image ?? {},
        title: pending.title ?? filenameTitle(line),
        url: new URL(line, baseUrl)
      });
      pending = {};
    }
  }

  if (!playlist.type) {
    playlist.type = inferType(playlist.entries);
  }

  return playlist;
}

function parseExtInf(line) {
  const value = line.slice("#EXTINF:".length);
  const comma = value.indexOf(",");
  const duration = Number(comma === -1 ? value : value.slice(0, comma));
  return {
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    title: comma === -1 ? "" : value.slice(comma + 1).trim()
  };
}

function parseAttributes(value) {
  return Object.fromEntries(
    value.split(",").map((part) => {
      const [key, rawAttributeValue = ""] = part.split("=");
      return [key.trim().toUpperCase(), rawAttributeValue.trim().replace(/^"|"$/g, "")];
    })
  );
}

function inferType(entries) {
  if (entries.some((entry) => entry.url.pathname.toLowerCase().endsWith(".m3u8"))) {
    return "INDEX";
  }
  return "ALBUM";
}

function chooseImageVariant(entries) {
  const supported = entries.filter((entry) => canDisplay(entry.url));
  return supported[0] ?? entries[0];
}

function canDisplay(url) {
  return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"].some((extension) =>
    url.pathname.toLowerCase().endsWith(extension)
  );
}

function renderAlbums() {
  elements.albumSelect.replaceChildren(
    ...albums.map((album) => {
      const option = document.createElement("option");
      option.textContent = album.title;
      option.value = album.url.href;
      return option;
    })
  );
}

function showSlide(index) {
  stopTimer();

  if (slides.length === 0) {
    showEmpty("No photos found");
    return;
  }

  currentIndex = (index + slides.length) % slides.length;
  const slide = slides[currentIndex];
  elements.photo.src = slide.url.href;
  elements.photo.alt = slide.title;
  elements.empty.hidden = true;
  elements.title.textContent = slide.title;
  elements.caption.textContent = slide.caption ?? "";
  setStatus(`${currentIndex + 1} / ${slides.length}`);
  scheduleNext(slide.duration);
}

function scheduleNext(slideDuration) {
  stopTimer();
  elements.playButton.textContent = playing ? "Pause" : "Play";
  if (!playing || slides.length <= 1) {
    return;
  }

  const duration = slideDuration ?? Number(elements.duration.value) ?? defaultDuration;
  timer = window.setTimeout(() => showSlide(currentIndex + 1), Math.max(1, duration) * 1000);
}

function stopTimer() {
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
}

function showEmpty(message) {
  elements.photo.removeAttribute("src");
  elements.empty.hidden = false;
  elements.empty.textContent = message;
  elements.title.textContent = "";
  elements.caption.textContent = "";
  setStatus(message);
}

function setStatus(message) {
  elements.status.textContent = message;
}

function filenameTitle(value) {
  const pathname = new URL(value, window.location.href).pathname;
  const name = decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1));
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}
