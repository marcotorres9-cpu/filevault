'use client';

import { useState, useEffect, useRef } from 'react';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      minHeight: '100dvh',
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
                  <a href={'/api/files/' + file.id + '/download'} style={{
                    padding: 'clamp(6px, 1.2vw, 8px) clamp(10px, 2vw, 14px)',
                    background: '#1d4ed8', color: '#fff', borderRadius: '8px',
                    fontSize: 'clamp(11px, 2.5vw, 13px)', fontWeight: '600',
                    textDecoration: 'none', display: 'inline-block',
                  }}>
                    Descargar
                  </a>
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