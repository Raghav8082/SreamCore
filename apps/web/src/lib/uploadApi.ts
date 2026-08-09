const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function createUploadSession(token: string, fileName: string, fileSize: number, title?: string) {
  const res = await fetch(`${API_BASE}/uploads/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fileName, fileSize, title: title || fileName }),
  });
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) throw new Error('Failed to create upload session');
  return res.json();
}

export async function uploadChunk(token: string, sessionId: string, index: number, chunk: Blob, checksum: string) {
  const res = await fetch(`${API_BASE}/uploads/${sessionId}/chunks/${index}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Chunk-Checksum': checksum,
      'Content-Type': 'application/octet-stream',
    },
    body: chunk,
  });
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) throw new Error(`Chunk ${index} failed`);
  return res.json();
}

export async function mergeSession(token: string, sessionId: string) {
  const res = await fetch(`${API_BASE}/uploads/${sessionId}/merge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) throw new Error('Merge failed');
  return res.json();
}

export async function getSessionStatus(token: string, sessionId: string) {
  const res = await fetch(`${API_BASE}/uploads/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) throw new Error('Failed to get session status');
  return res.json();
}

export async function searchVideos(token: string, query: string = '') {
  const res = await fetch(`${API_BASE}/videos/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) throw new Error('Failed to search videos');
  return res.json();
}