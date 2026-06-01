## Multistage build: First stage fetches dependencies
FROM alpine:3.23 AS fetcher

# install and copy ca-certificates, mailcap, and tini-static; download JSON.sh
RUN apk update && \
    apk --no-cache add ca-certificates mailcap tini-static && \
    wget -O /JSON.sh https://raw.githubusercontent.com/dominictarr/JSON.sh/0d5e5c77365f63809bf6e77ef44a1f34b0e05840/JSON.sh

## Static ffmpeg for server-side video thumbnails (v1.3 S6-2). A single
## self-contained, multi-arch static binary — the cleanest way to add
## ffmpeg to the BusyBox image (no package manager, no shared libs). The
## app runtime-detects it and falls back to the generic video icon when
## absent, so this stays a convenience, never a hard dependency.
FROM mwader/static-ffmpeg:7.1 AS ffmpeg

## Second stage: Use lightweight BusyBox image for final runtime environment
FROM busybox:1.38.0-musl

# Define non-root user UID and GID
ENV UID=1000
ENV GID=1000

# Create user group and user
RUN addgroup -g $GID user && \
    adduser -D -u $UID -G user user

# Copy binary, scripts, and configurations into image with proper ownership
COPY --chown=user:user filebrowser /bin/filebrowser
# S6-2: static ffmpeg → /usr/local/bin (on PATH for video-thumbnail
# generation). If PATH ever misses it, detection just fails gracefully.
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
# #3: ffprobe enables the transcode remux fast-path (probe codecs → stream-
# copy when already H.264/AAC). Optional — without it everything is fully
# transcoded, which is correct, just slower.
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
COPY --chown=user:user docker/common/ /
COPY --chown=user:user docker/alpine/ /
COPY --chown=user:user --from=fetcher /sbin/tini-static /bin/tini
COPY --from=fetcher /JSON.sh /JSON.sh
COPY --from=fetcher /etc/ca-certificates.conf /etc/ca-certificates.conf
COPY --from=fetcher /etc/ca-certificates /etc/ca-certificates
COPY --from=fetcher /etc/mime.types /etc/mime.types
COPY --from=fetcher /etc/ssl /etc/ssl

# Create data directories, set ownership, and ensure healthcheck script is executable
RUN mkdir -p /config /database /srv && \
    chown -R user:user /config /database /srv \
    && chmod +x /healthcheck.sh

# Define healthcheck script
HEALTHCHECK --start-period=2s --interval=5s --timeout=3s CMD /healthcheck.sh

# Set the user, volumes and exposed ports
USER user

VOLUME /srv /config /database

EXPOSE 80

ENTRYPOINT [ "tini", "--", "/init.sh" ]
