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

  // Load token from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('fv_token');
    const savedUser = localStorage.getItem('fv_username');
    if (saved) {
      setToken(saved);
    }
    if (savedUser) {
      setUsername(savedUser);
    }
  }, []);

  // Load files
  const loadFiles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/files');
      const data = await res.json();
      if (data.files) {
        setFiles(data.files);
      }
    } catch (e) {
      console.error('Error loading files:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // Show message helper
  const showMsg = (type: 'ok' | 'err', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // Login
  const handleLogin = async () => {
    if (!loginUser || !loginPass) {
      setLoginError('Usuario y contrasena son requeridos');
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        setUsername(data.user.username);
        localStorage.setItem('fv_token', data.token);
        localStorage.setItem('fv_username', data.user.username);
        setShowLogin(false);
        setLoginUser('');
        setLoginPass('');
        showMsg('ok', 'Sesion iniciada como ' + data.user.username);
      } else {
        setLoginError(data.error || 'Error al iniciar sesion');
      }
    } catch (e) {
      setLoginError('Error de conexion');
    } finally {
      setLoginLoading(false);
    }
  };

  // Logout
  const handleLogout = () => {
    setToken(null);
    setUsername(null);
    localStorage.removeItem('fv_token');
    localStorage.removeItem('fv_username');
    showMsg('ok', 'Sesion cerrada');
  };

  // Delete file - uses POST with token in query param (WebView-safe)
  const handleDelete = async (fileId: string, fileName: string) => {
    if (!token) {
      showMsg('err', 'Debes iniciar sesion para eliminar');
      setShowLogin(true);
      return;
    }
    if (!confirm('Eliminar "' + fileName + '"?')) return;

    setDeletingId(fileId);
    try {
      // Use POST instead of DELETE - WebView compatible
      const url = '/api/files?action=delete&id=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(token);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showMsg('ok', 'Archivo eliminado');
        setFiles(prev => prev.filter(f => f.id !== fileId));
      } else {
        showMsg('err', data.error || 'No se pudo eliminar');
      }
    } catch (e) {
      showMsg('err', 'Error de conexion al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  // Upload file
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) {
      showMsg('err', 'Debes iniciar sesion para subir archivos');
      setShowLogin(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      // Step 1: Get presigned URL
      const presignRes = await fetch('/api/files/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
        }),
      });

      if (!presignRes.ok) {
        const err = await presignRes.json();
        showMsg('err', err.error || 'Error al preparar subida');
        setUploading(false);
        return;
      }

      const { uploadUrl, r2Key } = await presignRes.json();
      setUploadProgress(30);

      // Step 2: Upload to R2
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (evt) => {
          if (evt.lengthComputable) {
            setUploadProgress(30 + Math.round((evt.loaded / evt.total) * 60));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error('Upload failed: ' + xhr.status));
        });
        xhr.addEventListener('error', () => reject(new Error('Upload error')));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      });

      setUploadProgress(90);

      // Step 3: Confirm
      const confirmRes = await fetch('/api/files/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          r2Key,
          originalName: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
        }),
      });

      if (!confirmRes.ok) {
        const err = await confirmRes.json();
        showMsg('err', err.error || 'Error al confirmar archivo');
      } else {
        showMsg('ok', 'Archivo subido exitosamente');
        loadFiles();
      }
      setUploadProgress(100);
    } catch (e) {
      showMsg('err', 'Error al subir archivo');
      console.error(e);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Download URL
  const getDownloadUrl = (file: FileItem) => {
    return '/api/files/' + file.id + '/download';
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '16px',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>
            FileVault
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Alojamiento de archivos
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {token ? (
            <>
              <span style={{
                background: '#1e3a5f',
                color: '#93c5fd',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
              }}>
                {username}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  background: '#7f1d1d',
                  color: '#fca5a5',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                }}
              >
                Cerrar sesion
              </button>
              <label style={{
                background: '#166534',
                color: '#bbf7d0',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                display: 'inline-block',
              }}>
                + Subir archivo
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
              </label>
            </>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              style={{
                background: '#1d4ed8',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: '600',
              }}
            >
              Iniciar sesion
            </button>
          )}
        </div>
      </div>

      {/* Message bar */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
          fontWeight: '600',
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
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '14px', marginBottom: '8px', color: '#94a3b8' }}>
            Subiendo archivo... {uploadProgress}%
          </div>
          <div style={{
            background: '#334155',
            borderRadius: '4px',
            height: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
              height: '100%',
              width: uploadProgress + '%',
              transition: 'width 0.3s',
              borderRadius: '4px',
            }} />
          </div>
        </div>
      )}

      {/* Login modal */}
      {showLogin && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px',
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '28px',
            width: '100%',
            maxWidth: '380px',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 20px 0' }}>
              Iniciar sesion
            </h2>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Usuario
              </label>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Tu usuario"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#0f172a',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                autoComplete="username"
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Contrasena
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Tu contrasena"
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 12px',
                    background: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '4px',
                  }}
                >
                  {showPass ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </div>

            {loginError && (
              <div style={{
                color: '#fca5a5',
                fontSize: '13px',
                marginBottom: '12px',
                background: '#450a0a',
                padding: '8px 12px',
                borderRadius: '6px',
              }}>
                {loginError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleLogin}
                disabled={loginLoading}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: loginLoading ? '#475569' : '#1d4ed8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: loginLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {loginLoading ? 'Entrando...' : 'Entrar'}
              </button>
              <button
                onClick={() => { setShowLogin(false); setLoginError(''); }}
                style={{
                  padding: '11px 16px',
                  background: '#334155',
                  color: '#94a3b8',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  cursor: 'pointer',
                }}
              >
                X
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File list */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9' }}>
            Archivos ({files.length})
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            Cargando archivos...
          </div>
        ) : files.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            No hay archivos todavia
          </div>
        ) : (
          <div style={{ padding: '4px' }}>
            {files.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  borderBottom: '1px solid #1e293b',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                {/* File icon */}
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  flexShrink: 0,
                }}>
                  {file.mimeType.startsWith('image/') ? 'IMG' :
                   file.mimeType.startsWith('video/') ? 'VID' :
                   file.mimeType.startsWith('audio/') ? 'AUD' :
                   file.mimeType === 'application/pdf' ? 'PDF' :
                   'FILE'}
                </div>

                {/* File info */}
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <div style={{
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#f1f5f9',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '400px',
                  }} title={file.originalName}>
                    {file.originalName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {formatSize(file.size)} · {file.downloads} descargas · {formatDate(file.createdAt)}
                    {file.user && <span> · {file.user.username}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <a
                    href={getDownloadUrl(file)}
                    style={{
                      padding: '8px 14px',
                      background: '#1d4ed8',
                      color: '#fff',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      textDecoration: 'none',
                      display: 'inline-block',
                    }}
                  >
                    Descargar
                  </a>
                  {token && (
                    <button
                      onClick={() => handleDelete(file.id, file.originalName)}
                      disabled={deletingId === file.id}
                      style={{
                        padding: '8px 14px',
                        background: deletingId === file.id ? '#475569' : '#991b1b',
                        color: '#fca5a5',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: deletingId === file.id ? 'not-allowed' : 'pointer',
                      }}
                    >
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
      <div style={{
        textAlign: 'center',
        marginTop: '24px',
        fontSize: '12px',
        color: '#475569',
      }}>
        FileVault v3.5
      </div>
    </div>
  );
}