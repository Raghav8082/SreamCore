'use client';
import { useState } from 'react';
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
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  async function handleUpload() {
    if (!file) return;
    const token = localStorage.getItem('accessToken');
    if (!token) { setStatus('Not logged in'); return; }

    try {
      let sessionId: string;
      let totalChunks: number;
      let alreadyUploaded = new Set<number>();

      const existing = loadUploadState(file.name);
      if (existing) {
        setStatus('Resuming previous upload...');
        const sessionStatus = await getSessionStatus(token, existing.sessionId);
        sessionId = existing.sessionId;
        totalChunks = existing.totalChunks;
        const missing = new Set(sessionStatus.missingChunks);
        alreadyUploaded = new Set(
          Array.from({ length: totalChunks }, (_, i) => i).filter((i) => !missing.has(i)),
        );
      } else {
        setStatus('Creating session...');
        const session = await createUploadSession(token, file.name, file.size);
        sessionId = session.sessionId;
        totalChunks = session.totalChunks;
        saveUploadState(file.name, sessionId, totalChunks);
      }

      for (let index = 0; index < totalChunks; index++) {
        if (alreadyUploaded.has(index)) {
          setProgress(Math.round(((index + 1) / totalChunks) * 100));
          continue; // skip chunks the server already confirmed
        }

        const start = index * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);
        const checksum = await sha256Hex(chunkBlob);

        await withRetry(() => uploadChunk(token, sessionId, index, chunkBlob, checksum));

        setProgress(Math.round(((index + 1) / totalChunks) * 100));
        setStatus(`Uploaded chunk ${index + 1}/${totalChunks}`);
      }

      setStatus('Merging...');
      const result = await mergeSession(token, sessionId);
      clearUploadState(file.name);
      setStatus(`Done! Checksum: ${result.finalChecksum}`);
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        setStatus('Session expired. Redirecting to login...');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        setStatus(`Upload failed: ${err.message || err}`);
      }
    }
  }

  return (
    <div>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={handleUpload} disabled={!file}>Upload</button>
      <p>{status}</p>
      <div style={{ width: '100%', background: '#eee' }}>
        <div style={{ width: `${progress}%`, background: '#4a90e2', height: '8px' }} />
      </div>
    </div>
  );
}