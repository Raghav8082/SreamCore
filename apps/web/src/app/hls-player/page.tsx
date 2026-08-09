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
            console.warn("HLS network error, retrying load in 3 seconds...", data);
            setErrorMsg("Video transcoding is in progress. Automatically retrying playback...");
            setTimeout(() => {
              setErrorMsg(null);
              if (hlsRef.current) {
                hlsRef.current.loadSource(manifestUrl);
                hlsRef.current.startLoad();
              }
            }, 3000);
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

import Link from "next/link";
import { searchVideos } from "../../lib/uploadApi";

interface VideoResult {
  id: string;
  title: string | null;
  fileName: string;
  createdAt: string;
}

function HlsPlayerContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("videoId");
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  const manifestUrl = videoId ? `${API_BASE}/streaming/videos/${videoId}/manifest` : "";
  const [videoIdInput, setVideoIdInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VideoResult[]>([]);
  const [isNotLoggedIn, setIsNotLoggedIn] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Perform search when user types or page loads
  const fetchVideos = useCallback(async (q: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setIsNotLoggedIn(true);
      return;
    }
    setIsNotLoggedIn(false);
    setIsSearching(true);
    try {
      const results = await searchVideos(token, q);
      setSearchResults(results || []);
    } catch (err: any) {
      console.error("Failed to search videos:", err);
      if (err.message === 'Unauthorized') {
        setIsNotLoggedIn(true);
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos(searchQuery);
  }, [searchQuery, fetchVideos]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      minHeight: "100vh",
      background: "#09090b",
      color: "#fff",
      padding: "32px 20px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      {/* Top Header */}
      <div style={{
        width: "100%",
        maxWidth: 960,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "30px"
      }}>
        <div>
          <h1 style={{
            fontSize: "2rem",
            fontWeight: "700",
            marginBottom: "6px",
            background: "linear-gradient(90deg, #818cf8, #c084fc)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}>
            STREAMCORE HLS Player
          </h1>
          <p style={{ color: "#8f8f9e", fontSize: "0.9rem", margin: 0 }}>
            Secure, multi-bitrate HLS streaming with title search & progress sync.
          </p>
        </div>

        <Link
          href="/upload"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(39, 39, 42, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            color: "#f4f4f5",
            padding: "10px 18px",
            borderRadius: "12px",
            fontSize: "0.875rem",
            fontWeight: "600",
            textDecoration: "none",
            transition: "all 0.2s ease"
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Upload Video</span>
        </Link>
      </div>

      {videoId ? (
        <div style={{ width: "100%", maxWidth: 960 }}>
          <div style={{ marginBottom: "15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.9rem", color: "#a1a1aa" }}>
              Playing Video ID: <code style={{ color: "#c084fc" }}>{videoId}</code>
            </span>
            <button
              onClick={() => window.history.pushState({}, "", "/hls-player")}
              style={{
                background: "#27272a",
                border: "none",
                color: "#f4f4f5",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: "600",
                transition: "background 0.2s"
              }}
            >
              Back to Video Search
            </button>
          </div>
          <HlsPlayer manifestUrl={manifestUrl} videoId={videoId ?? undefined} />
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 960 }}>
          {/* Title Search & ID Input Card */}
          <div style={{
            background: "rgba(18, 18, 24, 0.75)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "20px",
            padding: "28px",
            marginBottom: "32px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)"
          }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "16px", color: "#f4f4f5" }}>
              Search Video Library by Title
            </h2>
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="text"
                  placeholder="Search by video title or file name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 16px 12px 40px",
                    borderRadius: "10px",
                    border: "1px solid #27272a",
                    background: "#18181b",
                    color: "#fff",
                    fontSize: "0.95rem",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
                <svg
                  style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#71717a" }}
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>

            {/* Direct Video ID Option */}
            <details style={{ marginTop: "12px", color: "#71717a", fontSize: "0.85rem" }}>
              <summary style={{ cursor: "pointer", color: "#818cf8" }}>Or enter raw Video UUID directly</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (videoIdInput.trim()) {
                    window.history.pushState({}, "", `/hls-player?videoId=${encodeURIComponent(videoIdInput.trim())}`);
                  }
                }}
                style={{ marginTop: "12px", display: "flex", gap: "10px" }}
              >
                <input
                  type="text"
                  placeholder="Paste Video UUID here..."
                  value={videoIdInput}
                  onChange={(e) => setVideoIdInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #27272a',
                    background: '#09090b',
                    color: '#fff',
                    fontSize: '0.875rem'
                  }}
                />
                <button
                  type="submit"
                  disabled={!videoIdInput.trim()}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: videoIdInput.trim() ? 'linear-gradient(90deg, #6366f1, #a855f7)' : '#27272a',
                    color: '#fff',
                    fontWeight: '600',
                    cursor: videoIdInput.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  Play
                </button>
              </form>
            </details>
          </div>

          {/* Search Results / Video List */}
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "16px", color: "#e4e4e7" }}>
              {searchQuery ? `Search Results for "${searchQuery}"` : "Completed Uploads"}
            </h3>

            {isNotLoggedIn ? (
              <div style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "16px",
                padding: "28px",
                textAlign: "center",
                color: "#fca5a5"
              }}>
                <p style={{ margin: 0, fontWeight: "600", fontSize: "1rem" }}>Session Expired or Not Logged In</p>
                <p style={{ margin: "6px 0 16px 0", fontSize: "0.875rem", color: "#e4e4e7" }}>
                  Please sign in to search the video library and play streams.
                </p>
                <Link
                  href="/login"
                  style={{
                    display: "inline-block",
                    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                    color: "#fff",
                    padding: "10px 22px",
                    borderRadius: "10px",
                    textDecoration: "none",
                    fontWeight: "600",
                    fontSize: "0.875rem",
                    boxShadow: "0 4px 14px rgba(99, 102, 241, 0.4)"
                  }}
                >
                  Sign In to STREAMCORE
                </Link>
              </div>
            ) : isSearching ? (
              <p style={{ color: "#a1a1aa", fontSize: "0.9rem" }}>Loading videos...</p>
            ) : searchResults.length === 0 ? (
              <div style={{
                background: "rgba(24, 24, 27, 0.4)",
                border: "1px dashed #27272a",
                borderRadius: "16px",
                padding: "36px",
                textAlign: "center",
                color: "#71717a"
              }}>
                <p style={{ margin: 0, fontSize: "0.95rem" }}>No matching videos found.</p>
                <p style={{ margin: "6px 0 0 0", fontSize: "0.85rem" }}>
                  Upload a video first or try a different title search term.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                {searchResults.map((video) => (
                  <div
                    key={video.id}
                    style={{
                      background: "#18181b",
                      border: "1px solid #27272a",
                      borderRadius: "14px",
                      padding: "20px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "border-color 0.2s, transform 0.2s",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                    }}
                  >
                    <div>
                      <div style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "rgba(99,102,241,0.15)",
                        color: "#818cf8",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        marginBottom: "12px"
                      }}>
                        <span>HLS READY</span>
                      </div>
                      <h4 style={{
                        fontSize: "1rem",
                        fontWeight: "600",
                        color: "#f4f4f5",
                        margin: "0 0 6px 0",
                        wordBreak: "break-word"
                      }}>
                        {video.title || video.fileName}
                      </h4>
                      <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0, wordBreak: "break-all" }}>
                        File: {video.fileName}
                      </p>
                    </div>

                    <button
                      onClick={() => window.history.pushState({}, "", `/hls-player?videoId=${encodeURIComponent(video.id)}`)}
                      style={{
                        marginTop: "18px",
                        padding: "10px",
                        borderRadius: "10px",
                        border: "none",
                        background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                        color: "#ffffff",
                        fontSize: "0.875rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        boxShadow: "0 4px 14px rgba(99, 102, 241, 0.3)"
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      <span>Play Video</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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