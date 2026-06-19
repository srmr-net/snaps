# snaps
Simple Network Accessible Photo Service

The goal is to create a simple way to display photos (or any other image) from a server on the local network.

### Use cases:

- Reusing some old tablets and a Meta Portal mini as networked photo frames
- Using my TV as a rather large photo frame
- Easily viewing 3D and 360 degree photos on my Quest 3 over the network

### Approach:

Basically, we reuse .m3u8 playlists with some extra metadata to create "networked photo albums" that can sit on a server (even a
basic HTTP server with no special software)

### Non goals:

This isn't meant to be a fully featured photo service like Google Photos or Immich. 
