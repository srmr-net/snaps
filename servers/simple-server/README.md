# Snaps Simple Server

A small combined Snaps server and browser slideshow client.

It serves:

- `/` as a browser slideshow client.
- `/snaps.m3u8`, `/index.m3u8`, and `/albums.m3u8` as generated Snaps index playlists.
- `/albums/<album>.m3u8` as generated album playlists for image folders.
- `/media/...` as static files from the selected media root.

## Run

```sh
cd servers/simple-server
npm start -- ~/Pictures
```

Then open:

```text
http://localhost:7317/
```

Options:

```sh
node server.js [media-root] [--host 0.0.0.0] [--port 7317] [--duration 15]
```

The media root defaults to the current working directory. Each immediate
subdirectory containing image files becomes an album. Image files in the media
root become a `Root` album. Existing `.m3u8` files in the media root are listed
in the generated index and served unchanged under `/media/`.

To open a specific playlist in the browser client:

```text
http://localhost:7317/?playlist=/media/my-album.m3u8
```
