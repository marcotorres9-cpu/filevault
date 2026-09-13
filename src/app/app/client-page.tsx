'use client';

import { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    FvAndroid?: {
      isApp?: () => boolean;
      version?: () => string;
      saveStart?: (name: string, mime: string) => number;
      saveChunk?: (sid: number, b64: string) => boolean;
      saveEnd?: (sid: number) => boolean;
      saveAbort?: (sid: number) => void;
    };
    __fvDlNative?: (p: { state: 'start' | 'progress' | 'done' | 'saved' | 'error'; name?: string; got?: number; total?: number }) => void;
  }
}

interface FileItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  shareId: string;
  downloads: number;
  createdAt: string;
  user?: { username: string };
}

type DlPhase = 'starting' | 'downloading' | 'saving' | 'background' | 'done' | 'error';
interface DlState {
  name: string;
  pct: number | null;
  got: number;
  total: number | null;
  phase: DlPhase;
  hint?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Une trozos del stream en un solo buffer (para enviarlo al APK v5.2). */
function mergeChunks(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let off = 0;
  for (let i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
  return out;
}

/** Bytes -> base64 (sin el prefijo data:) para el puente nativo. */
function b64Of(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const fr = new FileReader();
      fr.onload = () => {
        const s = String(fr.result || '');
        const i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      fr.onerror = () => reject(new Error('b64'));
      fr.readAsDataURL(new Blob([bytes as unknown as BlobPart]));
    } catch (e) { reject(e instanceof Error ? e : new Error('b64')); }
  });
}

export default function AppClient() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dl, setDl] = useState<DlState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dlLockRef = useRef(false);
  const dlTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dlGenRef = useRef(0);
  const dlActivityRef = useRef(0);      // ultima senal de descarga (nativa o web)
  const dlNativeSeenRef = useRef(false); // si el APK ya reporto algo (puente v5+)
  const dlPhaseRef = useRef<DlPhase | null>(null); // fase actual (lectura sincrona para el puente)

  useEffect(() => {
    const saved = localStorage.getItem('fv_token');
    const savedUser = localStorage.getItem('fv_username');
    if (saved) setToken(saved);
    if (savedUser) setUsername(savedUser);
  }, []);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/files');
      const data = await res.json();
      if (data.files) setFiles(data.files);
    } catch (e) {
      console.error('Error loading files:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFiles(); }, []);

  // Espejo sincrono de la fase de descarga (para decisiones del puente nativo)
  useEffect(() => { dlPhaseRef.current = dl ? dl.phase : null; }, [dl]);

  // Puente con el APK nativo (FileVault v5.0+): el app reporta inicio/progreso/fin
  // de cada descarga del DownloadManager y la pagina muestra la barra real.
  useEffect(() => {
    window.__fvDlNative = (p) => {
      if (!p || typeof p !== 'object') return;
      dlNativeSeenRef.current = true;
      dlActivityRef.current = Date.now();
      if (p.state === 'start') {
        // Segunda pasada (guardado del archivo ya descargado): no reiniciar el cuadro
        if (dlPhaseRef.current === 'saving' || dlPhaseRef.current === 'done') return;
        dlGenRef.current += 1;
        dlLockRef.current = true;
        setDownloadingId(null);
        setDl({ name: p.name || 'archivo', pct: 0, got: 0, total: p.total && p.total > 0 ? p.total : null, phase: 'downloading' });
      } else if (p.state === 'progress') {
        // Durante el guardado (2da pasada) el progreso nativo no se muestra
        if (dlPhaseRef.current === 'saving' || dlPhaseRef.current === 'done' || dlPhaseRef.current === 'background') return;
        setDl(prev => {
          if (!prev) return prev;
          const total = p.total && p.total > 0 ? p.total : prev.total;
          const got = Math.max(prev.got, p.got || 0);
          return { ...prev, phase: 'downloading', got, total, pct: total ? Math.min(99, Math.round((got / total) * 100)) : null };
        });
      } else if (p.state === 'saved') {
        // APK v5.2 confirmo que el archivo quedo en "Descargas"
        dlTimersRef.current.forEach(clearTimeout);
        dlTimersRef.current = [];
        setDl(prev => prev && prev.phase === 'saving' ? { ...prev, phase: 'done', pct: 100, got: p.got || prev.got, hint: undefined } : prev);
        setDownloadingId(null);
        dlTimersRef.current.push(setTimeout(() => { dlLockRef.current = false; setDl(null); }, 8000));
        loadFiles();
      } else if (p.state === 'done') {
        dlTimersRef.current.forEach(clearTimeout);
        dlTimersRef.current = [];
        setDl(prev => prev ? { ...prev, phase: 'done', pct: 100, got: p.got || prev.got, hint: undefined } : prev);
        setDownloadingId(null);
        dlTimersRef.current.push(setTimeout(() => { dlLockRef.current = false; setDl(null); }, 8000));
        loadFiles();
      } else if (p.state === 'error') {
        dlTimersRef.current.forEach(clearTimeout);
        dlTimersRef.current = [];
        setDl(prev => prev ? { ...prev, phase: 'error' } : prev);
        setDownloadingId(null);
        dlTimersRef.current.push(setTimeout(() => { dlLockRef.current = false; setDl(null); }, 8000));
      }
    };
    return () => { try { delete window.__fvDlNative; } catch {} };
  }, []);

  const showMsg = (type: 'ok' | 'err', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleLogin = async () => {
    if (!loginUser || !loginPass) { setLoginError('Usuario y contrasena requeridos'); return; }
    setLoginLoading(true); setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token); setUsername(data.user.username);
        localStorage.setItem('fv_token', data.token);
        localStorage.setItem('fv_username', data.user.username);
        setShowLogin(false); setLoginUser(''); setLoginPass('');
        showMsg('ok', 'Sesion iniciada: ' + data.user.username);
      } else {
        setLoginError(data.error || 'Error al iniciar sesion');
      }
    } catch { setLoginError('Error de conexion'); }
    finally { setLoginLoading(false); }
  };

  const handleLogout = () => {
    setToken(null); setUsername(null);
    localStorage.removeItem('fv_token'); localStorage.removeItem('fv_username');
    showMsg('ok', 'Sesion cerrada');
  };

  const handleDelete = async (fileId: string, fileName: string) => {
    if (!token) { showMsg('err', 'Debes iniciar sesion'); setShowLogin(true); return; }
    if (!confirm('Eliminar "' + fileName + '"?')) return;
    setDeletingId(fileId);
    try {
      const url = '/api/files?action=delete&id=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(token);
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (res.ok && data.ok) {
        showMsg('ok', 'Eliminado');
        setFiles(prev => prev.filter(f => f.id !== fileId));
      } else {
        showMsg('err', data.error || 'No se pudo eliminar');
      }
    } catch { showMsg('err', 'Error de conexion'); }
    finally { setDeletingId(null); }
  };

  const handleDownload = (file: FileItem) => {
    // Bloqueo duro: una sola descarga a la vez (evita duplicados por toques repetidos en TV)
    if (dlLockRef.current) {
      showMsg('err', 'Ya hay una descarga en curso. Espera el aviso de "Descarga completa".');
      return;
    }
    dlGenRef.current += 1;
    const gen = dlGenRef.current;
    dlTimersRef.current.forEach(clearTimeout); // limpia temporizadores de una descarga anterior
    dlTimersRef.current = [];
    dlLockRef.current = true;
    dlActivityRef.current = Date.now();
    dlNativeSeenRef.current = false;
    setDownloadingId(file.id);

    const url = token
      ? '/api/files/' + file.id + '/download?token=' + encodeURIComponent(token)
      : '/api/download/' + file.shareId;

    const closeDl = () => {
      dlTimersRef.current.forEach(clearTimeout);
      dlTimersRef.current = [];
      dlLockRef.current = false;
      setDownloadingId(null);
      setDl(null);
    };
    const later = (fn: () => void, ms: number) => { dlTimersRef.current.push(setTimeout(fn, ms)); };
    const finishOk = () => {
      setDl(prev => prev ? { ...prev, phase: 'done', pct: 100, hint: undefined } : prev);
      setDownloadingId(null);
      later(() => { dlLockRef.current = false; setDl(null); }, 8000);
    };
    const refreshFiles = () => {
      fetch('/api/files').then(r => r.json()).then(d => { if (d.files) setFiles(d.files); }).catch(() => {});
    };
    const openNativeIframe = () => {
      const f = document.createElement('iframe');
      f.style.display = 'none';
      f.src = url;
      document.body.appendChild(f);
    };

    // APK Android (WebView) o archivo muy grande en escritorio.
    const inApk = !!(window.FvAndroid && typeof window.FvAndroid.isApp === 'function' && window.FvAndroid.isApp());
    const inWebview = inApk || /;\s*wv\)/.test(navigator.userAgent);
    const fv = inWebview ? window.FvAndroid : undefined;
    const canNativeSave = !!(fv && typeof fv.saveStart === 'function' && typeof fv.saveChunk === 'function' && typeof fv.saveEnd === 'function');

    // Red anti-colgado para el flujo ciego (DownloadManager sin avisos nativos)
    const armBlindWatchdog = () => {
      later(() => {
        if (dlGenRef.current !== gen) return;
        if (Date.now() - dlActivityRef.current < 40000) return; // hay senal reciente
        setDl(prev => (prev && (prev.phase === 'starting' || prev.phase === 'downloading'))
          ? { ...prev, phase: 'background', pct: null } : prev);
        dlLockRef.current = false;
        setDownloadingId(null);
        later(() => {
          if (dlGenRef.current !== gen) return;
          setDl(prev => (prev && prev.phase === 'background') ? null : prev);
        }, 12000);
      }, 45000);
    };
    // Fallback ciego: si el stream fallo, deja que el DownloadManager lo descargue
    const startBlind = () => {
      setDl(prev => prev ? { ...prev, phase: 'downloading', pct: null, got: 0 } : prev);
      dlActivityRef.current = Date.now();
      openNativeIframe();
      armBlindWatchdog();
    };

    if (!inWebview && file.size > 250 * 1048576) {
      // Escritorio con archivo enorme: descarga directa del navegador
      setDl({ name: file.originalName, pct: null, got: 0, total: file.size || null, phase: 'starting' });
      openNativeIframe();
      later(() => {
        setDl(prev => (prev && prev.phase === 'starting') ? { ...prev, phase: 'downloading' } : prev);
      }, 10000);
      armBlindWatchdog();
      return;
    }

    // ---------- CAMINO 1: APK v5.2 — % real + guardado en UNA sola pasada ----------
    if (inWebview && canNativeSave) {
      const f2 = fv as NonNullable<typeof fv>;
      setDl({ name: file.originalName, pct: 0, got: 0, total: file.size || null, phase: 'downloading' });
      (async () => {
        let sid = 0;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (!res.body) throw new Error('stream no disponible');
          const lenHeader = Number(res.headers.get('content-length'));
          const total = lenHeader && lenHeader > 0 ? lenHeader : (file.size || null);
          setDl(prev => prev ? { ...prev, total } : prev);
          sid = f2.saveStart!(file.originalName, file.mimeType || 'application/octet-stream');
          if (!sid || sid < 0) throw new Error('saveStart');
          const reader = res.body.getReader();
          let got = 0;
          let buf: Uint8Array[] = [];
          let bufLen = 0;
          const flushBuf = async () => {
            if (bufLen === 0) return;
            const merged = mergeChunks(buf, bufLen);
            buf = []; bufLen = 0;
            const b64 = await b64Of(merged);
            if (!(f2.saveChunk!(sid, b64))) throw new Error('saveChunk');
          };
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.length) {
              buf.push(value); bufLen += value.length; got += value.length;
              dlActivityRef.current = Date.now();
              if (dlGenRef.current === gen) {
                setDl(prev => prev ? { ...prev, got, pct: total ? Math.min(99, Math.round((got / total) * 100)) : null } : prev);
              }
              if (bufLen >= 524288) await flushBuf();
            }
          }
          await flushBuf();
          if (dlGenRef.current !== gen) { try { f2.saveAbort!(sid); } catch {} return; }
          setDl(prev => prev ? { ...prev, phase: 'saving', pct: 100 } : prev);
          if (!(f2.saveEnd!(sid))) throw new Error('saveEnd');
          // El nativo confirma con __fvDlNative({state:'saved'}); red por si no llega:
          later(() => {
            if (dlGenRef.current !== gen) return;
            setDl(prev => (prev && prev.phase === 'saving') ? { ...prev, phase: 'done', hint: undefined } : prev);
            later(() => { dlLockRef.current = false; setDl(prev => (prev && prev.phase === 'done') ? null : prev); }, 8000);
          }, 20000);
        } catch {
          try { if (sid > 0) f2.saveAbort!(sid); } catch {}
          if (dlGenRef.current !== gen) return;
          startBlind();
        }
      })();
      return;
    }

    // ---------- CAMINO 2: APK vieja (v4/v5.0/v5.1) — % REAL en la pagina; al
    // 100% el DownloadManager guarda el archivo (2da pasada, ya desde cache) ----------
    if (inWebview && file.size <= 150 * 1048576) {
      setDl({
        name: file.originalName, pct: 0, got: 0, total: file.size || null, phase: 'downloading',
        hint: 'Al llegar al 100% tu dispositivo guarda el archivo en "Descargas". Actualiza la app ("Descargar APK") y sera en una sola pasada.',
      });
      (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (!res.body) throw new Error('stream no disponible');
          const lenHeader = Number(res.headers.get('content-length'));
          const total = lenHeader && lenHeader > 0 ? lenHeader : (file.size || null);
          setDl(prev => prev ? { ...prev, total } : prev);
          const reader = res.body.getReader();
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.length) {
              got += value.length;
              dlActivityRef.current = Date.now();
              if (dlGenRef.current === gen) {
                setDl(prev => prev ? { ...prev, got, pct: total ? Math.min(99, Math.round((got / total) * 100)) : null } : prev);
              }
            }
          }
          if (dlGenRef.current !== gen) return;
          // 100% real alcanzado: ahora si guardar en Descargas
          setDl(prev => prev ? { ...prev, phase: 'saving', pct: 100 } : prev);
          dlActivityRef.current = Date.now();
          openNativeIframe();
          later(() => {
            if (dlGenRef.current !== gen) return;
            if (Date.now() - dlActivityRef.current < 65000) return; // nativo sigue reportando
            setDl(prev => (prev && prev.phase === 'saving')
              ? { ...prev, phase: 'background', hint: undefined } : prev);
            dlLockRef.current = false;
            setDownloadingId(null);
            later(() => {
              if (dlGenRef.current !== gen) return;
              setDl(prev => (prev && prev.phase === 'background') ? null : prev);
            }, 12000);
          }, 70000);
        } catch {
          if (dlGenRef.current !== gen) return;
          startBlind();
        }
      })();
      return;
    }

    // ---------- CAMINO 3: APK vieja + archivo muy grande: descarga directa ----------
    if (inWebview) {
      setDl({ name: file.originalName, pct: null, got: 0, total: file.size || null, phase: 'starting' });
      openNativeIframe();
      later(() => {
        setDl(prev => (prev && prev.phase === 'starting') ? { ...prev, phase: 'downloading' } : prev);
        if (!dlNativeSeenRef.current) {
          setDl(prev => prev && !prev.hint
            ? { ...prev, hint: 'Archivo grande: descarga directa. Actualiza tu app ("Descargar APK") para ver el porcentaje real.' }
            : prev);
        }
      }, 10000);
      armBlindWatchdog();
      return;
    }

    // Navegador normal: descarga por stream con progreso real (% y MB)
    setDl({ name: file.originalName, pct: 0, got: 0, total: file.size || null, phase: 'downloading' });
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const lenHeader = Number(res.headers.get('content-length'));
        const total = lenHeader && lenHeader > 0 ? lenHeader : (file.size || null);
        if (!res.body) throw new Error('stream no disponible');
        setDl(prev => prev ? { ...prev, total } : prev);
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length) {
            chunks.push(value);
            got += value.length;
            if (dlGenRef.current === gen) {
              setDl(prev => prev ? { ...prev, got, pct: total ? Math.min(99, Math.round((got / total) * 100)) : null } : prev);
            }
          }
        }
        if (dlGenRef.current !== gen) return; // otra descarga tomo el control
        setDl(prev => prev ? { ...prev, phase: 'saving', pct: 100 } : prev);
        const blob = new Blob(chunks as unknown as BlobPart[]);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = file.originalName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        finishOk();
        refreshFiles();
      } catch {
        // Sin stream o error: deja que el navegador/WebView descargue por su cuenta
        if (dlGenRef.current !== gen) return;
        setDl(prev => prev ? { ...prev, phase: 'downloading', pct: null } : prev);
        openNativeIframe();
        later(finishOk, 25000);
      }
    })();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) { showMsg('err', 'Debes iniciar sesion'); setShowLogin(true); if (fileInputRef.current) fileInputRef.current.value = ''; return; }
    setUploading(true); setUploadProgress(0);
    try {
      const presignRes = await fetch('/api/files/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type || 'application/octet-stream' }),
      });
      if (!presignRes.ok) { const err = await presignRes.json(); showMsg('err', err.error || 'Error'); setUploading(false); return; }
      const { uploadUrl, r2Key } = await presignRes.json();
      setUploadProgress(30);
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (evt) => { if (evt.lengthComputable) setUploadProgress(30 + Math.round((evt.loaded / evt.total) * 60)); });
        xhr.addEventListener('load', () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error('Upload ' + xhr.status)); });
        xhr.addEventListener('error', () => reject(new Error('Upload error')));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      });
      setUploadProgress(90);
      const confirmRes = await fetch('/api/files/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ r2Key, originalName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size }),
      });
      if (!confirmRes.ok) { const err = await confirmRes.json(); showMsg('err', err.error || 'Error'); }
      else { showMsg('ok', 'Archivo subido'); loadFiles(); }
      setUploadProgress(100);
    } catch { showMsg('err', 'Error al subir'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: '#e2e8f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: 'clamp(8px, 2vw, 20px)',
      boxSizing: 'border-box',
      fontSize: '16px',
      WebkitTextSizeAdjust: '100%',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'clamp(12px, 2vw, 24px)',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 'bold', color: '#f8fafc', margin: 0, lineHeight: 1.2 }}>
            FileVault
          </h1>
          <p style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', color: '#94a3b8', margin: '2px 0 0 0' }}>
            Alojamiento de archivos
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/apk" style={{
            background: '#334155', color: '#e2e8f0', textDecoration: 'none',
            padding: 'clamp(6px, 1.5vw, 8px) clamp(10px, 2vw, 16px)', borderRadius: '8px',
            cursor: 'pointer', fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: '600',
            display: 'inline-block', border: '1px solid #475569',
          }}>
            Descargar APK
          </a>
          {token ? (
            <>
              <span style={{
                background: '#1e3a5f', color: '#93c5fd',
                padding: 'clamp(4px, 1vw, 6px) clamp(8px, 2vw, 14px)',
                borderRadius: '8px', fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: '600',
              }}>
                {username}
              </span>
              <button onClick={handleLogout} style={{
                background: '#7f1d1d', color: '#fca5a5', border: 'none',
                padding: 'clamp(6px, 1.5vw, 8px) clamp(10px, 2vw, 16px)', borderRadius: '8px',
                cursor: 'pointer', fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: '600',
              }}>
                Salir
              </button>
              <label style={{
                background: '#166534', color: '#bbf7d0',
                padding: 'clamp(6px, 1.5vw, 8px) clamp(10px, 2vw, 16px)', borderRadius: '8px',
                cursor: 'pointer', fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: '600',
                display: 'inline-block',
              }}>
                + Subir
                <input ref={fileInputRef} type="file" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
              </label>
            </>
          ) : (
            <button onClick={() => setShowLogin(true)} style={{
              background: '#1d4ed8', color: '#fff', border: 'none',
              padding: 'clamp(8px, 2vw, 10px) clamp(16px, 3vw, 20px)', borderRadius: '8px',
              cursor: 'pointer', fontSize: 'clamp(14px, 3vw, 16px)', fontWeight: '600',
            }}>
              Iniciar sesion
            </button>
          )}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
          fontSize: 'clamp(13px, 2.5vw, 14px)', fontWeight: '600',
          background: message.type === 'ok' ? '#14532d' : '#7f1d1d',
          color: message.type === 'ok' ? '#bbf7d0' : '#fca5a5',
          border: '1px solid ' + (message.type === 'ok' ? '#166534' : '#991b1b'),
        }}>
          {message.text}
        </div>
      )}

      {/* Overlay de descarga: barra de progreso + avisos (bloquea toques repetidos) */}
      {dl && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(2,6,23,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1200, padding: '16px',
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: '14px',
            padding: 'clamp(18px, 4vw, 26px)', width: '100%', maxWidth: '430px',
            boxShadow: '0 12px 48px rgba(0,0,0,0.55)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '11px', flexShrink: 0,
                background: dl.phase === 'done' ? '#166534' : dl.phase === 'error' ? '#7f1d1d' : dl.phase === 'background' ? '#92400e' : '#1d4ed8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', color: '#fff', fontWeight: 'bold',
              }}>
                {dl.phase === 'done' ? '\u2713' : dl.phase === 'error' ? '!' : dl.phase === 'background' ? '\u2197' : '\u2193'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'clamp(16px, 3.5vw, 18px)', fontWeight: 'bold', color: '#f8fafc' }}>
                  {dl.phase === 'done' ? 'Descarga completa'
                    : dl.phase === 'error' ? 'Error en la descarga'
                    : dl.phase === 'background' ? 'Descarga en segundo plano'
                    : dl.phase === 'saving' ? 'Guardando archivo...'
                    : dl.phase === 'starting' ? 'Iniciando descarga...'
                    : 'Descargando...'}
                </div>
                <div style={{ fontSize: 'clamp(13px, 3vw, 14px)', color: '#93c5fd', fontWeight: '600', overflowWrap: 'anywhere' }}>
                  {dl.name}
                </div>
              </div>
            </div>

            {dl.phase !== 'done' && dl.phase !== 'error' && dl.phase !== 'background' && (
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '7px', height: '16px', overflow: 'hidden' }}>
                {dl.pct !== null ? (
                  <div style={{
                    background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)', height: '100%',
                    width: Math.max(3, dl.pct) + '%', transition: 'width 0.25s', borderRadius: '7px',
                  }} />
                ) : (
                  <div className="fv-dl-indeterminate" style={{
                    background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)', height: '100%', width: '40%', borderRadius: '7px',
                  }} />
                )}
              </div>
            )}

            <div style={{ marginTop: '12px', fontSize: 'clamp(14px, 3vw, 15px)', color: '#e2e8f0', fontWeight: '600' }}>
              {dl.phase === 'done' && 'El archivo se guardo en tu carpeta "Descargas".'}
              {dl.phase === 'error' && 'No se pudo descargar. Vuelve a intentarlo.'}
              {dl.phase === 'background' && 'Tu dispositivo sigue guardando el archivo en la carpeta "Descargas". Puedes usar la app con normalidad; si todavia no aparece, espera un momento y revisa esa carpeta.'}
              {dl.phase === 'saving' && 'Guardando el archivo en tu carpeta "Descargas"...'}
              {dl.phase === 'starting' && 'Conectando con el servidor...'}
              {dl.phase === 'downloading' && (
                dl.pct !== null
                  ? dl.pct + '% \u2014 ' + formatSize(dl.got) + (dl.total ? ' de ' + formatSize(dl.total) : '')
                  : dl.got > 0
                    ? formatSize(dl.got) + ' descargados...'
                    : 'Descargando en tu dispositivo' + (dl.total ? ' (' + formatSize(dl.total) + ')' : '') + '. Al terminar queda en tu carpeta "Descargas".'
              )}
            </div>

            {dl.hint && (
              <div style={{ marginTop: '8px', fontSize: 'clamp(12px, 2.5vw, 13px)', color: '#fbbf24', fontWeight: '600' }}>
                {dl.hint}
              </div>
            )}

            {(dl.phase === 'starting' || dl.phase === 'downloading' || dl.phase === 'saving') && (
              <div style={{ marginTop: '8px', fontSize: 'clamp(12px, 2.5vw, 13px)', color: '#94a3b8' }}>
                Puedes cerrar este cuadro y la descarga sigue. No toques "Descargar" de nuevo hasta ver el aviso final.
              </div>
            )}

            <button onClick={() => {
              dlTimersRef.current.forEach(clearTimeout);
              dlTimersRef.current = [];
              dlLockRef.current = false;
              setDl(null);
              setDownloadingId(null);
            }} style={{
              marginTop: '14px', width: '100%', padding: '10px', border: 'none', borderRadius: '8px',
              background: dl.phase === 'done' ? '#166534' : dl.phase === 'background' ? '#92400e' : '#334155', color: '#fff',
              fontSize: 'clamp(14px, 3vw, 15px)', fontWeight: 'bold', cursor: 'pointer',
            }}>
              {dl.phase === 'done' ? 'Cerrar'
                : dl.phase === 'error' ? 'Cerrar'
                : dl.phase === 'background' ? 'Entendido'
                : 'Seguir en segundo plano'}
            </button>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: '8px',
          padding: 'clamp(10px, 2vw, 16px)', marginBottom: '12px',
        }}>
          <div style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', marginBottom: '6px', color: '#94a3b8' }}>
            Subiendo... {uploadProgress}%
          </div>
          <div style={{ background: '#334155', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
            <div style={{ background: '#3b82f6', height: '100%', width: uploadProgress + '%', transition: 'width 0.3s', borderRadius: '4px' }} />
          </div>
        </div>
      )}

      {/* Login modal */}
      {showLogin && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px',
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
            padding: 'clamp(20px, 4vw, 28px)', width: '100%', maxWidth: '380px',
          }}>
            <h2 style={{ fontSize: 'clamp(18px, 4vw, 20px)', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 16px 0' }}>
              Iniciar sesion
            </h2>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: 'clamp(12px, 2.5vw, 13px)', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Usuario</label>
              <input type="text" value={loginUser} onChange={(e) => setLoginUser(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Tu usuario"
                autoComplete="username"
                style={{
                  width: '100%', padding: 'clamp(8px, 2vw, 10px) 12px',
                  background: '#0f172a', border: '1px solid #475569', borderRadius: '8px',
                  color: '#f8fafc', fontSize: 'clamp(14px, 3vw, 16px)', boxSizing: 'border-box', outline: 'none',
                }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: 'clamp(12px, 2.5vw, 13px)', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Contrasena</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} value={loginPass} onChange={(e) => setLoginPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Tu contrasena"
                  autoComplete="current-password"
                  style={{
                    width: '100%', padding: 'clamp(8px, 2vw, 10px) 44px clamp(8px, 2vw, 10px) 12px',
                    background: '#0f172a', border: '1px solid #475569', borderRadius: '8px',
                    color: '#f8fafc', fontSize: 'clamp(14px, 3vw, 16px)', boxSizing: 'border-box', outline: 'none',
                  }} />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{
                  position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                  fontSize: 'clamp(13px, 2.5vw, 15px)', padding: '4px',
                }}>
                  {showPass ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </div>
            {loginError && (
              <div style={{ color: '#fca5a5', fontSize: 'clamp(12px, 2.5vw, 13px)', marginBottom: '10px', background: '#450a0a', padding: '8px 12px', borderRadius: '6px' }}>
                {loginError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleLogin} disabled={loginLoading} style={{
                flex: 1, padding: 'clamp(9px, 2vw, 11px)',
                background: loginLoading ? '#475569' : '#1d4ed8', color: '#fff', border: 'none',
                borderRadius: '8px', fontSize: 'clamp(14px, 3vw, 15px)', fontWeight: '600',
                cursor: loginLoading ? 'not-allowed' : 'pointer',
              }}>
                {loginLoading ? 'Entrando...' : 'Entrar'}
              </button>
              <button onClick={() => { setShowLogin(false); setLoginError(''); }} style={{
                padding: 'clamp(9px, 2vw, 11px) clamp(12px, 2vw, 16px)',
                background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '8px',
                fontSize: 'clamp(14px, 3vw, 15px)', cursor: 'pointer',
              }}>
                X
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File list */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{
          padding: 'clamp(10px, 2vw, 14px) clamp(12px, 2vw, 16px)',
          borderBottom: '1px solid #334155',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 'clamp(14px, 3vw, 16px)', fontWeight: '600', color: '#f1f5f9' }}>
            Archivos ({files.length})
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 'clamp(24px, 5vw, 40px)', textAlign: 'center', color: '#64748b', fontSize: 'clamp(14px, 3vw, 16px)' }}>
            Cargando archivos...
          </div>
        ) : files.length === 0 ? (
          <div style={{ padding: 'clamp(24px, 5vw, 40px)', textAlign: 'center', color: '#64748b', fontSize: 'clamp(14px, 3vw, 16px)' }}>
            No hay archivos todavia
          </div>
        ) : (
          <div style={{ padding: 'clamp(2px, 0.5vw, 4px)' }}>
            {files.map((file) => (
              <div key={file.id} style={{
                display: 'flex', alignItems: 'center',
                padding: 'clamp(8px, 1.5vw, 12px)',
                borderBottom: '1px solid rgba(30,41,59,0.8)',
                gap: 'clamp(8px, 1.5vw, 12px)',
                flexWrap: 'wrap',
              }}>
                {/* Icon */}
                <div style={{
                  width: 'clamp(36px, 8vw, 42px)', height: 'clamp(36px, 8vw, 42px)',
                  borderRadius: '8px', background: '#334155',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'clamp(10px, 2.5vw, 13px)', fontWeight: 'bold', color: '#94a3b8',
                  flexShrink: 0,
                }}>
                  {file.mimeType.startsWith('image/') ? 'IMG' :
                   file.mimeType.startsWith('video/') ? 'VID' :
                   file.mimeType.startsWith('audio/') ? 'AUD' :
                   file.mimeType === 'application/pdf' ? 'PDF' : 'FILE'}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 'clamp(13px, 3vw, 15px)', fontWeight: '600', color: '#f1f5f9',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={file.originalName}>
                    {file.originalName}
                  </div>
                  <div style={{ fontSize: 'clamp(11px, 2vw, 12px)', color: '#64748b', marginTop: '2px' }}>
                    {formatSize(file.size)} · {file.downloads} desc · {formatDate(file.createdAt)}
                    {file.user && <span> · {file.user.username}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {downloadingId === file.id ? (
                    <div style={{
                      width: 'clamp(90px, 18vw, 120px)', height: '26px',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px',
                    }}>
                      <div className="fv-dl-track" />
                      <span style={{ fontSize: '10px', color: '#93c5fd', fontWeight: '600', textAlign: 'center' }}>
                        Descargando...
                      </span>
                    </div>
                  ) : (
                    <button onClick={() => handleDownload(file)} style={{
                      padding: 'clamp(6px, 1.2vw, 8px) clamp(10px, 2vw, 14px)',
                      background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px',
                      fontSize: 'clamp(11px, 2.5vw, 13px)', fontWeight: '600',
                      cursor: 'pointer', display: 'inline-block',
                    }}>
                      Descargar
                    </button>
                  )}
                  {token && (
                    <button onClick={() => handleDelete(file.id, file.originalName)}
                      disabled={deletingId === file.id} style={{
                        padding: 'clamp(6px, 1.2vw, 8px) clamp(10px, 2vw, 14px)',
                        background: deletingId === file.id ? '#475569' : '#991b1b',
                        color: '#fca5a5', border: 'none', borderRadius: '8px',
                        fontSize: 'clamp(11px, 2.5vw, 13px)', fontWeight: '600',
                        cursor: deletingId === file.id ? 'not-allowed' : 'pointer',
                      }}>
                      {deletingId === file.id ? '...' : 'Eliminar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: 'clamp(16px, 3vw, 24px)', fontSize: 'clamp(11px, 2vw, 12px)', color: '#475569' }}>
        FileVault v3.5
      </div>
    </div>
  );
}