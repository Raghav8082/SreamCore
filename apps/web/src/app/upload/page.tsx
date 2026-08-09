'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sha256Hex } from '../../lib/checksum';
import { createUploadSession, uploadChunk, mergeSession, getSessionStatus } from '../../lib/uploadApi';

const CHUNK_SIZE = 5 * 1024 * 1024;

function saveUploadState(fileName: string, sessionId: string, totalChunks: number) {
  localStorage.setItem(`upload-${fileName}`, JSON.stringify({ sessionId, totalChunks }));
}
function loadUploadState(fileName: string) {
  const raw = localStorage.getItem(`upload-${fileName}`);
  return raw ? JSON.parse(raw) : null;
}
function clearUploadState(fileName: string) {
  localStorage.removeItem(`upload-${fileName}`);
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);

  const handleFileChange = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (selectedFile && !title) {
      // Auto fill title without extension
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExt);
    }
    setUploadedVideoId(null);
    setProgress(0);
    setStatus('');
  };

  async function handleUpload() {
    if (!file) return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setStatus('Not logged in. Redirecting to login...');
      setTimeout(() => (window.location.href = '/login'), 1500);
      return;
    }

    setIsUploading(true);
    setUploadedVideoId(null);

    try {
      let sessionId: string;
      let totalChunks: number;
      let alreadyUploaded = new Set<number>();

      const existing = loadUploadState(file.name);
      if (existing) {
        setStatus('Resuming previous upload session...');
        const sessionStatus = await getSessionStatus(token, existing.sessionId);
        sessionId = existing.sessionId;
        totalChunks = existing.totalChunks;
        const missing = new Set(sessionStatus.missingChunks);
        alreadyUploaded = new Set(
          Array.from({ length: totalChunks }, (_, i) => i).filter((i) => !missing.has(i)),
        );
      } else {
        setStatus('Creating upload session...');
        const session = await createUploadSession(token, file.name, file.size, title || file.name);
        sessionId = session.sessionId;
        totalChunks = session.totalChunks;
        saveUploadState(file.name, sessionId, totalChunks);
      }

      for (let index = 0; index < totalChunks; index++) {
        if (alreadyUploaded.has(index)) {
          setProgress(Math.round(((index + 1) / totalChunks) * 100));
          continue;
        }

        const start = index * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);
        const checksum = await sha256Hex(chunkBlob);

        await withRetry(() => uploadChunk(token, sessionId, index, chunkBlob, checksum));

        const pct = Math.round(((index + 1) / totalChunks) * 100);
        setProgress(pct);
        setStatus(`Uploading chunk ${index + 1} of ${totalChunks} (${pct}%)`);
      }

      setStatus('Finalizing video processing & merging...');
      await mergeSession(token, sessionId);
      clearUploadState(file.name);
      setStatus('Upload complete! Video processing queued.');
      setUploadedVideoId(sessionId);
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        setStatus('Session expired. Redirecting to login...');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        setStatus(`Upload failed: ${err.message || err}`);
      }
    } finally {
      setIsUploading(false);
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#09090b',
        color: '#f4f4f5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: '32px 20px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Background Decorative Glow Orbs */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '20%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
        }}
      />

      {/* Top Header Navigation Bar */}
      <header
        style={{
          width: '100%',
          maxWidth: '800px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '36px',
          zIndex: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" fill="#fff" fillOpacity="0.2" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, letterSpacing: '-0.02em' }}>
              STREAMCORE
            </h1>
            <p style={{ fontSize: '0.75rem', color: '#71717a', margin: 0 }}>High-Performance Video Upload</p>
          </div>
        </div>

        {/* HLS Player Navigation Button */}
        <Link
          href="/hls-player"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(39, 39, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#f4f4f5',
            padding: '10px 18px',
            borderRadius: '12px',
            fontSize: '0.875rem',
            fontWeight: '600',
            textDecoration: 'none',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#3f3f46';
            e.currentTarget.style.borderColor = '#818cf8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(39, 39, 42, 0.8)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Open HLS Player</span>
        </Link>
      </header>

      {/* Upload Glass Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          background: 'rgba(18, 18, 24, 0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '36px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          zIndex: 1,
        }}
      >
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '6px' }}>Upload New Video</h2>
          <p style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>
            Upload raw video files in 5MB chunks. They will automatically transcode for HLS streaming.
          </p>
        </div>

        {/* Video Title Field */}
        <div style={{ marginBottom: '24px' }}>
          <label
            htmlFor="videoTitle"
            style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#d4d4d8',
              marginBottom: '8px',
            }}
          >
            Video Title <span style={{ color: '#71717a', fontWeight: 'normal' }}>(Searchable in player)</span>
          </label>
          <input
            id="videoTitle"
            type="text"
            placeholder="e.g. Action Scene Trailer - 1080p"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isUploading}
            style={{
              width: '100%',
              padding: '13px 16px',
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '0.95rem',
              outline: 'none',
              transition: 'all 0.2s ease',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#6366f1';
              e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#27272a';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* File Dropzone Area */}
        <div
          style={{
            border: '2px dashed rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            padding: '36px 20px',
            textAlign: 'center',
            background: 'rgba(24, 24, 27, 0.5)',
            marginBottom: '28px',
            position: 'relative',
            cursor: 'pointer',
            transition: 'border-color 0.2s, background 0.2s',
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) {
              handleFileChange(e.dataTransfer.files[0]);
            }
          }}
        >
          <input
            type="file"
            accept="video/*"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            disabled={isUploading}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: isUploading ? 'not-allowed' : 'pointer',
            }}
          />
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          {file ? (
            <div>
              <p style={{ fontSize: '1rem', fontWeight: '600', color: '#f4f4f5', marginBottom: '4px' }}>
                {file.name}
              </p>
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>Size: {formatFileSize(file.size)}</p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '1rem', fontWeight: '600', color: '#f4f4f5', marginBottom: '4px' }}>
                Drag & drop your video here, or click to browse
              </p>
              <p style={{ fontSize: '0.825rem', color: '#71717a' }}>Supports MP4, MOV, MKV, AVI video files</p>
            </div>
          )}
        </div>

        {/* Progress & Status */}
        {isUploading || progress > 0 || status ? (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: '#d4d4d8', fontWeight: '500' }}>
                {status || 'Uploading...'}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#818cf8', fontWeight: '700' }}>{progress}%</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '10px',
                background: '#18181b',
                borderRadius: '5px',
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                  borderRadius: '5px',
                  transition: 'width 0.3s ease',
                  boxShadow: '0 0 12px rgba(99, 102, 241, 0.6)',
                }}
              />
            </div>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            style={{
              flex: 1,
              padding: '14px 24px',
              borderRadius: '12px',
              border: 'none',
              background: file && !isUploading ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' : '#27272a',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: file && !isUploading ? 'pointer' : 'not-allowed',
              boxShadow: file && !isUploading ? '0 4px 20px rgba(99, 102, 241, 0.35)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isUploading ? (
              <span>Uploading Chunks...</span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Start Chunked Upload</span>
              </>
            )}
          </button>

          {uploadedVideoId && (
            <Link
              href={`/hls-player?videoId=${uploadedVideoId}`}
              style={{
                padding: '14px 24px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '0.95rem',
                fontWeight: '600',
                textDecoration: 'none',
                boxShadow: '0 4px 20px rgba(16, 185, 129, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Watch in HLS Player</span>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}