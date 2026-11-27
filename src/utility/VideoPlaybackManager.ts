// Lightweight singleton to ensure only one primary video plays at a time
// and to coordinate Picture-in-Picture across videos.

export type PlayOptions = {
  preferPiP?: boolean;
  preserveVideoUntilPlaying?: HTMLVideoElement | null;
};

const getDocumentPiP = () => (window as Window & {
  documentPictureInPicture?: { requestWindow: (size: {
    width: number
    height: number
  }) => Promise<Window> }
}).documentPictureInPicture;

class VideoPlaybackManagerImpl {
  private currentVideo?: HTMLVideoElement;
  private pipWindow: Window | null = null;
  private pipVideo: HTMLVideoElement | null = null;
  private wasPlayingBeforePiP = false;
  private pipCaptionsOverlay: HTMLDivElement | null = null;
  private pipSelectedTrackIndex: number = -1;
  private pipCaptionsOn: boolean = false;

  isPiPEnabled(): boolean {
    try {
      return this.supportsDocumentPiP() ||
        Boolean(document.pictureInPictureEnabled) ||
        ('webkitSupportsPresentationMode' in (HTMLVideoElement.prototype as any));
    } catch {
      return false;
    }
  }

  supportsDocumentPiP(): boolean {
    try {
      return typeof getDocumentPiP()?.requestWindow === 'function';
    } catch { return false; }
  }

  isPiPActive(): boolean {
    try {
      return Boolean(this.pipWindow || document.pictureInPictureElement);
    } catch {
      return false;
    }
  }

  async exitPiP(): Promise<void> {
    try {
      if (this.pipWindow) {
        try { this.pipWindow.close(); } catch {}
        this.pipWindow = null;
        this.pipVideo = null;
      }
      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture?.();
      }
    } catch {
      // ignore
    }
  }

  private async requestPiP(video: HTMLVideoElement): Promise<boolean> {
    const v = video as any;
    try {
      // Prefer Document PiP if available; it allows full control and captions overlay
      if (this.supportsDocumentPiP()) {
        const dpi = getDocumentPiP()!;
        // Attempt to size roughly like the source element
        const rect = video.getBoundingClientRect?.();
        const width = Math.max(320, Math.round(rect?.width || 640));
        const height = Math.max(180, Math.round(rect?.height || 360));
        const pipWin: Window = await dpi.requestWindow({ width, height });
        this.pipWindow = pipWin;

        // Basic styles
        const doc = pipWin.document;
        doc.body.style.margin = '0';
        doc.body.style.background = 'black';
        const pipVid = doc.createElement('video');
        pipVid.style.width = '100%';
        pipVid.style.height = '100%';
        pipVid.style.objectFit = 'contain';
        pipVid.playsInline = true;
        pipVid.controls = false; // Keep window clean; use original page controls
        if (video.crossOrigin) { pipVid.crossOrigin = video.crossOrigin; }
        const sourceWasMuted = video.muted;
        pipVid.muted = sourceWasMuted;
        pipVid.volume = video.volume;

        // Use the same source URL (currentSrc so we get preview/full appropriately)
        try { pipVid.src = (video.currentSrc || video.src); } catch { pipVid.src = video.src; }

        // Clone <track> elements so captions can render in PiP window
        const tracks: NodeListOf<HTMLTrackElement> = (video.querySelectorAll('track') as any) || [];
        tracks.forEach((t) => {
          const nt = doc.createElement('track');
          nt.kind = t.kind as any;
          nt.src = t.src;
          if (t.srclang) { nt.srclang = t.srclang; }
          if (t.label) { nt.label = t.label; }
          if (t.default) { nt.default = true; }
          pipVid.appendChild(nt);
        });

        this.wasPlayingBeforePiP = !video.paused && !video.ended;
        // Sync current time
        try { pipVid.currentTime = video.currentTime || 0; } catch {}
        // Mute original and play PiP video to avoid double audio
        try { video.muted = true; } catch {}
        // Apply initial track selection based on source element state
        try {
          const srcTracks: any = (video as any).textTracks as any;
          let activeIndex = 0;
          let captionsOn = false;
          const count = srcTracks?.length ?? 0;
          for (let i = 0; i < count; i++) {
            if (srcTracks[i] && srcTracks[i].mode === 'showing') { activeIndex = i; captionsOn = true; break; }
          }
          const pvTracks: any = (pipVid as any).textTracks as any;
          const pvCount = pvTracks?.length ?? 0;
          for (let i = 0; i < pvCount; i++) {
            pvTracks[i].mode = captionsOn && i === activeIndex ? 'showing' : 'hidden';
          }
          const trackEls = pipVid.querySelectorAll('track');
          for (let i = 0; i < trackEls.length; i++) {
            const el = trackEls[i] as HTMLTrackElement;
            if (captionsOn && i === activeIndex) { el.setAttribute('default', ''); }
            else { el.removeAttribute('default'); }
          }
          // Remember selection for overlay + future sync
          this.pipSelectedTrackIndex = captionsOn ? activeIndex : -1;
          this.pipCaptionsOn = captionsOn;
        } catch { /* ignore */ }
        // Simple captions overlay that mirrors activeCue in the PiP window
        try {
          const overlay = doc.createElement('div');
          overlay.style.position = 'absolute';
          overlay.style.left = '0';
          overlay.style.right = '0';
          overlay.style.bottom = '6%';
          overlay.style.padding = '4px 10px';
          overlay.style.textAlign = 'center';
          overlay.style.color = 'white';
          overlay.style.fontSize = '16px';
          overlay.style.lineHeight = '1.35';
          overlay.style.textShadow = '0 0 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6)';
          overlay.style.pointerEvents = 'none';
          overlay.style.fontFamily = 'system-ui, sans-serif';
          overlay.style.whiteSpace = 'pre-wrap';
          const container = doc.createElement('div');
          container.style.position = 'relative';
          container.style.width = '100%';
          container.style.height = '100%';
          container.appendChild(pipVid);
          container.appendChild(overlay);
          doc.body.appendChild(container);
          this.pipCaptionsOverlay = overlay;
          const updateOverlay = () => {
            try {
              const tracks: any = (pipVid as any).textTracks as any;
              const idx = this.pipSelectedTrackIndex;
              if (!this.pipCaptionsOn || idx < 0 || !tracks || !tracks[idx]) { overlay.textContent = ''; return; }
              const active = tracks[idx].activeCues;
              if (!active || active.length === 0) { overlay.textContent = ''; return; }
              const text = Array.from(active as any).map((c: any) => c.text).join('\n');
              overlay.textContent = text || '';
            } catch { overlay.textContent = ''; }
          };
          const pvTracks: any = (pipVid as any).textTracks as any;
          const pvCount = pvTracks?.length ?? 0;
          for (let i = 0; i < pvCount; i++) {
            try { pvTracks[i].addEventListener('cuechange', updateOverlay); } catch {}
          }
          const poll = pipWin.setInterval(updateOverlay, 250);
          pipWin.addEventListener('pagehide', () => { try { pipWin.clearInterval(poll); } catch {} }, { once: true });
          updateOverlay();
        } catch { /* ignore */ }

        // Keep reference for later sync
        this.pipVideo = pipVid as any;

        // When the PiP window closes, restore playback/time and unmute original
        pipWin.addEventListener('pagehide', () => {
          try {
            if (this.currentVideo === video) {
              const t = pipVid.currentTime;
              if (Number.isFinite(t)) { try { video.currentTime = t; } catch {} }
              if (this.wasPlayingBeforePiP) { video.play?.().catch(() => {}); }
            }
            video.muted = sourceWasMuted;
          } catch {}
          this.pipWindow = null;
          this.pipVideo = null;
          this.pipCaptionsOverlay = null;
          this.pipSelectedTrackIndex = -1;
          this.pipCaptionsOn = false;
        }, { once: true });
        void pipVid.play().catch(() => {});
        return true;
      }
    } catch {
      // A Document PiP request can be blocked even when native video PiP works.
      if (this.pipWindow) { await this.exitPiP(); }
    }

    try {
      if (document.pictureInPictureEnabled !== false && 'requestPictureInPicture' in v) {
        await v.requestPictureInPicture();
        v.play?.().catch(() => {});
        return true;
      }
    } catch { /* try the Safari presentation mode */ }

    try {
      if ('webkitSupportsPresentationMode' in v && v.webkitSupportsPresentationMode('picture-in-picture')) {
        v.webkitSetPresentationMode('picture-in-picture');
        v.play?.().catch(() => {});
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  private pauseVideo(video?: HTMLVideoElement) {
    try {
      video?.pause?.();
    } catch {
      // ignore
    }
  }

  async requestPlay(video: HTMLVideoElement, opts: PlayOptions = {}):
    Promise<'playing' | 'blocked' | 'failed'> {
    const wasPiPActive = this.isPiPActive();
    const previousVideo = this.currentVideo;
    this.currentVideo = video;
    const switchingVideo = previousVideo && previousVideo !== video;
    const leavingPiP = switchingVideo && (wasPiPActive || this.pipWindow)
      ? this.exitPiP()
      : undefined;
    if (switchingVideo && (previousVideo !== opts.preserveVideoUntilPlaying || wasPiPActive)) {
      this.pauseVideo(previousVideo);
    }
    // The adaptive full-video controller may temporarily detach the
    // progressive source while hls.js is loading. Preserve an explicit play
    // request so it can resume once the manifest is ready.
    try { video.dataset.fullVideoPlayRequested = 'true'; } catch { /* ignore */ }
    // Keep play() inside the original input event, including PiP handoffs.
    try { await video.play(); } catch (error) {
      return error instanceof Error && error.name === 'NotAllowedError' ? 'blocked' : 'failed';
    }
    if (leavingPiP) { await leavingPiP; }

    if (this.currentVideo === video && (opts.preferPiP || wasPiPActive) &&
      (switchingVideo || !wasPiPActive) && this.isPiPEnabled()) {
      await this.requestPiP(video);
    }
    return 'playing';
  }

  async togglePiP(video: HTMLVideoElement): Promise<boolean> {
    // Ensure this video is the current one
    if (this.currentVideo && this.currentVideo !== video) {
      this.pauseVideo(this.currentVideo);
    }
    this.currentVideo = video;

    if (this.pipWindow || (document as any).pictureInPictureElement) {
      await this.exitPiP();
      return true;
    }
    const webkitVideo = video as HTMLVideoElement & {
      webkitPresentationMode?: string
      webkitSetPresentationMode?: (mode: string) => void
    };
    if (webkitVideo.webkitPresentationMode === 'picture-in-picture' &&
      webkitVideo.webkitSetPresentationMode) {
      try {
        webkitVideo.webkitSetPresentationMode('inline');
        return true;
      } catch {
        return false;
      }
    }
    return this.isPiPEnabled() && this.requestPiP(video);
  }

  // Keep PiP text tracks in sync with source (for Document PiP)
  syncTextTracksFrom(video: HTMLVideoElement, captionsOn: boolean, activeIndex: number) {
    try {
      // Standard PiP shares textTracks; nothing to do.
      if (!this.pipWindow || !this.pipVideo) { return; }
      const pv = this.pipVideo as any;
      const tracks: TextTrackList = pv.textTracks as any;
      const count = tracks?.length ?? 0;
      for (let i = 0; i < count; i++) {
        const t = tracks[i];
        if (!t) { continue; }
        (t as any).mode = captionsOn && i === activeIndex ? 'showing' : 'hidden';
      }
      // Sync default attributes as well
      const trackEls = pv.querySelectorAll('track');
      for (let i = 0; i < trackEls.length; i++) {
        const el = trackEls[i] as HTMLTrackElement;
        if (captionsOn && i === activeIndex) { el.setAttribute('default', ''); }
        else { el.removeAttribute('default'); }
      }
      // Keep overlay state and force a refresh
      this.pipSelectedTrackIndex = captionsOn ? Math.max(0, activeIndex) : -1;
      this.pipCaptionsOn = captionsOn;
      try {
        const list: any = pv.textTracks as any;
        if (list && this.pipSelectedTrackIndex >= 0 && list[this.pipSelectedTrackIndex]) {
          const evt = new Event('cuechange');
          list[this.pipSelectedTrackIndex].dispatchEvent?.(evt);
        }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }
}

export const VideoPlaybackManager = new VideoPlaybackManagerImpl();
