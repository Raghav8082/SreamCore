"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Hls, { Level } from "hls.js";

interface HlsPlayerProps {
  manifestUrl: string;
  videoId?: string;
  onError?: (message: string) => void;
}

export function HlsPlayer({ manifestUrl, videoId, onError }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = auto
  const [isBuffering, setIsBuffering] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !manifestUrl) return;

    // Prefer Hls.js even if native is supported, to allow setting authorization header
    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        enableWorker: true,
        xhrSetup: (xhr, url) => {
          const token = localStorage.getItem("accessToken");
          if (token && url.includes("/streaming/")) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
        },
      });
      hlsRef.current = hls;

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLevels(data.levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.warn("HLS network error, retrying load...", data);
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.warn("HLS media error, attempting recovery...", data);
            hls.recoverMediaError();
            break;
          default:
            console.error("Fatal HLS error, destroying instance", data);
            setErrorMsg("Playback failed. Please retry.");
            onError?.(data.details);
            hls.destroy();
            break;
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native fallback (e.g. iOS Safari)
      video.src = manifestUrl;
    } else {
      setErrorMsg("HLS playback is not supported in this browser.");
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [manifestUrl, onError]);

  // Buffering indicator driven by native video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onCanPlay = () => setIsBuffering(false);

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);

    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, []);

  const handleLevelChange = useCallback((levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex; // -1 = auto (ABR)
    }
    setCurrentLevel(levelIndex);
  }, []);
  // Restore and report playback progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoId) return;

    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
    const token = typeof window !== 'undefined' ? localStorage.getItem("accessToken") : null;

    let savedPosition = 0;
    let hasSeeked = false;
    let lastReported = 0;

    const saveProgress = (position: number) => {
      if (position <= 0) return;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      fetch(`${API_BASE}/videos/${videoId}/progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          positionSeconds: position,
          durationSeconds: video.duration || null,
        }),
        keepalive: true,
      }).catch(err => console.error("Failed to save progress", err));
    };

    const trySeek = () => {
      if (savedPosition > 0 && !hasSeeked && video.readyState >= 1) {
        video.currentTime = savedPosition;
        lastReported = savedPosition;
        hasSeeked = true;
      }
    };

    const fetchProgress = async () => {
      try {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${API_BASE}/videos/${videoId}/progress`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && data.positionSeconds && !data.completed) {
            savedPosition = data.positionSeconds;
            trySeek();
          }
        }
      } catch (err) {
        console.error("Failed to fetch playback progress", err);
      }
    };

    fetchProgress();

    const handleLoadedMetadata = () => {
      trySeek();
    };

    const handleLoadedData = () => {
      trySeek();
    };

    const handleCanPlay = () => {
      trySeek();
    };

    const handlePlay = () => {
      trySeek();
    };

    const handleTimeUpdate = () => {
      const now = video.currentTime;
      if (Math.abs(now - lastReported) >= 5) {
        lastReported = now;
        saveProgress(now);
      }
    };

    const handlePause = () => {
      saveProgress(video.currentTime);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveProgress(video.currentTime);
      }
    };

    const handleBeforeUnload = () => {
      saveProgress(video.currentTime);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("play", handlePlay);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("pause", handlePause);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("pause", handlePause);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [videoId]);
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 960 }}>
      <video
        ref={videoRef}
        controls
        style={{ width: "100%", borderRadius: "8px", backgroundColor: "#000" }}
      />

      {isBuffering && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#fff",
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            padding: "8px 16px",
            borderRadius: "4px",
            fontSize: 14,
          }}
        >
          Buffering...
        </div>
      )}

      {errorMsg && (
        <div style={{ color: "#ff6b6b", fontSize: 13, marginTop: 8 }}>
          {errorMsg}
        </div>
      )}

      {levels.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#888" }}>Quality:</span>
          <select
            value={currentLevel}
            onChange={(e) => handleLevelChange(Number(e.target.value))}
            style={{
              fontSize: 13,
              background: "#1e1e24",
              color: "#fff",
              border: "1px solid #333",
              borderRadius: "4px",
              padding: "4px 8px",
            }}
          >
            <option value={-1}>Auto</option>
            {levels.map((level, index) => (
              <option key={index} value={index}>
                {level.height}p ({Math.round(level.bitrate / 1000)} kbps)
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function HlsPlayerContent() {
  const searchParams = useSearchParams();
  const [videoIdInput, setVideoIdInput] = useState("");
  const videoId = searchParams.get("videoId");

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  const manifestUrl = videoId ? `${API_BASE}/streaming/videos/${videoId}/manifest` : "";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "#121214",
      color: "#fff",
      padding: "20px",
      fontFamily: "system-ui, sans-serif"
    }}>
      <div style={{ width: "100%", maxWidth: 960, marginBottom: "20px" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: "700", marginBottom: "10px", background: "linear-gradient(90deg, #4f46e5, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          StreamCore HLS Player
        </h1>
        <p style={{ color: "#8f8f9e", fontSize: "0.95rem" }}>
          Secure, chunked HLS playback with dynamic quality switching.
        </p>
      </div>

      {videoId ? (
        <div style={{ width: "100%", maxWidth: 960 }}>
          <div style={{ marginBottom: "15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.9rem", color: "#a1a1aa" }}>Playing Video ID: <code style={{ color: "#ec4899" }}>{videoId}</code></span>
            <button 
              onClick={() => window.history.pushState({}, "", "/hls-player")}
              style={{
                background: "#27272a",
                border: "none",
                color: "#f4f4f5",
                padding: "6px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.85rem",
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#3f3f46"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#27272a"}
            >
              Back
            </button>
          </div>
          <HlsPlayer manifestUrl={manifestUrl} videoId={videoId ?? undefined} />
        </div>
      ) : (
        <div style={{
          width: "100%",
          maxWidth: "480px",
          background: "#1e1e24",
          border: "1px solid #2d2d34",
          borderRadius: "12px",
          padding: "30px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
        }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "20px" }}>Enter Video ID to Stream</h2>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (videoIdInput.trim()) {
              window.history.pushState({}, "", `/hls-player?videoId=${encodeURIComponent(videoIdInput.trim())}`);
            }
          }}>
            <input
              type="text"
              placeholder="e.g. d3b07384-d113..."
              value={videoIdInput}
              onChange={(e) => setVideoIdInput(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #3f3f46",
                background: "#09090b",
                color: "#fff",
                fontSize: "1rem",
                marginBottom: "16px",
                boxSizing: "border-box"
              }}
            />
            <button
              type="submit"
              disabled={!videoIdInput.trim()}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                background: videoIdInput.trim() ? "linear-gradient(90deg, #4f46e5, #ec4899)" : "#3f3f46",
                color: "#fff",
                fontSize: "1rem",
                fontWeight: "600",
                cursor: videoIdInput.trim() ? "pointer" : "not-allowed",
                transition: "opacity 0.2s"
              }}
            >
              Stream Video
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function HlsPlayerPage() {
  return (
    <Suspense fallback={<div style={{ color: "#fff", textAlign: "center", marginTop: "50px" }}>Loading player...</div>}>
      <HlsPlayerContent />
    </Suspense>
  );
}