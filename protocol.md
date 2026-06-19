# Snaps Protocol

Snaps uses ordinary `.m3u8` playlists to publish image collections over HTTP.
The intent is that a basic static file server can host albums, and simple
clients can discover and display them as networked photo frames.

The protocol defines three playlist roles:

1. An index playlist that lists the albums available on a server.
2. An album playlist that lists the images in one album.
3. An optional image playlist that lists alternate versions of one image.

All playlists should be valid UTF-8 text and should use the `.m3u8` extension.
Relative URLs are resolved relative to the playlist that contains them.

## Common Format

Every Snaps playlist is an extended M3U playlist:

```m3u8
#EXTM3U
```

Entries may include standard M3U metadata using `#EXTINF`. Snaps-specific
metadata uses HLS-style extension tags prefixed with `#EXT-X-SNAPS-`. Unknown
tags should be ignored by clients so that the protocol can grow without
breaking older clients.

Recommended client behavior:

- Treat HTTP URLs, HTTPS URLs, and relative URLs as valid item locations.
- Ignore blank lines and comments that are not recognized Snaps metadata.
- Preserve playlist order unless the user or client explicitly requests shuffle.
- Cache playlists and images using normal HTTP cache headers when available.
- Re-fetch playlists periodically so albums can be updated by replacing static
  files on the server.

## Playlist Roles

Snaps identifies playlist roles with `#EXT-X-SNAPS-TYPE`.

```m3u8
#EXT-X-SNAPS-TYPE:INDEX
#EXT-X-SNAPS-TYPE:ALBUM
#EXT-X-SNAPS-TYPE:IMAGE
```

Clients should use this tag when present. If it is missing, a client may infer
the role from context:

- The first playlist opened by the user can be treated as an index or album.
- A playlist referenced by an index can be treated as an album.
- A playlist referenced by an album can be treated as an image playlist.

## Index Playlist

An index playlist is a playlist of playlists. It lists the photo albums
available from a server.

Each entry points to an album playlist.

```m3u8
#EXTM3U
#EXT-X-SNAPS-TYPE:INDEX
#EXTINF:-1,Family
albums/family.m3u8
#EXTINF:-1,Vacations
albums/vacations.m3u8
#EXTINF:-1,3D Photos
albums/3d.m3u8
```

Servers should usually expose an index playlist at a predictable URL such as:

```text
/snaps.m3u8
/index.m3u8
/albums.m3u8
```

## Album Playlist

An album playlist is a playlist of image files. It represents one photo album or
rotation.

Each entry points to either:

- A directly displayable image file.
- An image playlist containing alternate versions of the same image.

```m3u8
#EXTM3U
#EXT-X-SNAPS-TYPE:ALBUM
#EXT-X-SNAPS-DEFAULT-DURATION:15
#EXTINF:10,Beach at sunset
#EXT-X-SNAPS-EXIF:DATE-TIME="2025-07-12T20:14:00Z",CAMERA="Pixel 9 Pro",LOCATION="Brighton"
#EXT-X-SNAPS-CAPTION:A warm evening on Brighton beach.
images/beach-sunset.jpg
#EXT-X-PROGRAM-DATE-TIME:2025-07-13T09:00:00Z
#EXTINF:20,Kitchen remodel
images/kitchen.m3u8
#EXTINF:-1,Mountain panorama
images/mountain-panorama.jpg
```

Recommended image formats:

- JPEG for photos.
- PNG for graphics or images needing lossless quality.
- WebP or AVIF when the client is known to support them.

Clients should skip entries they cannot load and continue to the next item.

## Timing and Scheduling

Snaps borrows HLS-style timing from `#EXTINF`. For album playlists, the
duration value in `#EXTINF` is an advisory display duration in seconds for the
following image or image playlist.

```m3u8
#EXTINF:10,Beach at sunset
images/beach-sunset.jpg
```

A value of `-1` means no duration is specified.

```m3u8
#EXTINF:-1,Mountain panorama
images/mountain-panorama.jpg
```

An album may provide a default duration with
`#EXT-X-SNAPS-DEFAULT-DURATION`. Clients may use this when an item has no
explicit duration.

```m3u8
#EXT-X-SNAPS-DEFAULT-DURATION:15
```

An album entry may also include `#EXT-X-PROGRAM-DATE-TIME` as an advisory
absolute time for when the following image or image playlist should become
eligible for display.

```m3u8
#EXT-X-PROGRAM-DATE-TIME:2025-07-13T09:00:00Z
#EXTINF:20,Kitchen remodel
images/kitchen.m3u8
```

Timing and scheduling tags are hints, not requirements. Clients may ignore
them, clamp them, or replace them with a local user preference.

## Image Playlist

An image playlist is optional. It contains multiple versions of the same image,
such as different resolutions, encodings, crops, or orientations.

Clients choose the best entry for their display and capabilities.

```m3u8
#EXTM3U
#EXT-X-SNAPS-TYPE:IMAGE
#EXTINF:-1,Landscape 1920x1080
#EXT-X-SNAPS-IMAGE:WIDTH=1920,HEIGHT=1080,ORIENTATION=LANDSCAPE
kitchen-1920x1080.jpg
#EXTINF:-1,Portrait 1080x1920
#EXT-X-SNAPS-IMAGE:WIDTH=1080,HEIGHT=1920,ORIENTATION=PORTRAIT
kitchen-1080x1920.jpg
#EXTINF:-1,Original
#EXT-X-SNAPS-IMAGE:WIDTH=4032,HEIGHT=3024,ORIENTATION=LANDSCAPE
kitchen-original.jpg
```

Recommended client selection:

- Prefer an orientation that matches the display.
- Prefer the smallest image that is at least as large as the display.
- Prefer supported formats over unsupported formats.
- Fall back to the first loadable entry.

## Snaps Metadata

Snaps metadata uses HLS-style extension tags so the files remain compatible
with basic playlist parsers.

### `#EXT-X-SNAPS-TYPE`

Declares the role of the current playlist.

Allowed values:

- `INDEX`
- `ALBUM`
- `IMAGE`

### `#EXT-X-SNAPS-DEFAULT-DURATION`

Declares an advisory default display duration, in seconds, for album entries
that do not provide an explicit `#EXTINF` duration.

Example:

```m3u8
#EXT-X-SNAPS-DEFAULT-DURATION:15
```

### `#EXT-X-PROGRAM-DATE-TIME`

Provides an advisory absolute display time for the next album entry. This uses
the HLS tag name and an ISO 8601 timestamp.

Example:

```m3u8
#EXT-X-PROGRAM-DATE-TIME:2025-07-13T09:00:00Z
#EXTINF:10,Photo
photo.jpg
```

### `#EXT-X-SNAPS-CAPTION`

Provides an optional caption for the next image or image playlist entry.
`#EXTINF` may still be used for a short display title, while
`#EXT-X-SNAPS-CAPTION` is intended for longer descriptive text.

Example:

```m3u8
#EXTINF:10,Beach at sunset
#EXT-X-SNAPS-CAPTION:A warm evening on Brighton beach.
beach-sunset.jpg
```

### `#EXT-X-SNAPS-IMAGE`

Describes the next image entry in an image playlist.

Supported attributes:

- `WIDTH`: Pixel width.
- `HEIGHT`: Pixel height.
- `ORIENTATION`: `LANDSCAPE`, `PORTRAIT`, or `SQUARE`.
- `FORMAT`: Optional image format hint, such as `JPEG`, `PNG`, `WEBP`, or `AVIF`.

Example:

```m3u8
#EXT-X-SNAPS-IMAGE:WIDTH=1920,HEIGHT=1080,ORIENTATION=LANDSCAPE,FORMAT=JPEG
photo-1920.jpg
```

### `#EXT-X-SNAPS-EXIF`

Provides EXIF-style metadata for the next image or image playlist entry. This
metadata is optional and may be partial. Clients may display it, use it for
filtering, or ignore it.

Supported attributes:

- `DATE-TIME`: Capture time as an ISO 8601 timestamp.
- `CAMERA`: Camera or device name.
- `LENS`: Lens name.
- `WIDTH`: Original pixel width.
- `HEIGHT`: Original pixel height.
- `ORIENTATION`: `LANDSCAPE`, `PORTRAIT`, or `SQUARE`.
- `LOCATION`: Human-readable location.
- `LATITUDE`: GPS latitude in decimal degrees.
- `LONGITUDE`: GPS longitude in decimal degrees.
- `ALTITUDE`: GPS altitude in meters.

Example:

```m3u8
#EXT-X-SNAPS-EXIF:DATE-TIME="2025-07-12T20:14:00Z",CAMERA="Pixel 9 Pro",LATITUDE=50.8225,LONGITUDE=-0.1372
beach-sunset.jpg
```

## Compatibility

Snaps playlists are deliberately simple:

- A generic M3U8 parser can read the item URLs.
- A plain HTTP server can host the files.
- Missing Snaps metadata should not make a playlist unusable.
- Unknown Snaps tags and attributes should be ignored.

## Access and Discovery

Snaps does not define authentication, authorization, or access control. Servers
are expected to expose playlists and images directly to clients that can reach
their URLs.

Snaps also does not define server discovery. Users or clients are expected to
know the URL of the Snaps server or index playlist.

## Live Updates

Snaps uses normal HTTP behavior for live updates. Servers may include a
`Refresh` response header on playlist responses to tell clients when to fetch
the playlist again.

```http
Refresh: 60
```

The value is an advisory refresh interval in seconds. Clients may use it for
index playlists, album playlists, and image playlists.

Clients may ignore the `Refresh` header, clamp it to a local minimum or
maximum, or replace it with a user preference. If no `Refresh` header is
present, clients may still re-fetch playlists periodically using their own
polling interval.

Servers should also use normal HTTP cache headers such as `ETag`,
`Last-Modified`, and `Cache-Control` when available. Clients should prefer
conditional requests when refreshing playlists.

## Example Directory

```text
public/
  snaps.m3u8
  albums/
    family.m3u8
    vacations.m3u8
  images/
    beach-sunset.jpg
    mountain-panorama.jpg
    kitchen.m3u8
    kitchen-1920x1080.jpg
    kitchen-1080x1920.jpg
    kitchen-original.jpg
```
