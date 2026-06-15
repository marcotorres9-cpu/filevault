'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Download,
  Trash2,
  Copy,
  LogOut,
  CloudUpload,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  Archive,
  File,
  Link2,
  Check,
  Shield,
  Zap,
  FolderOpen,
  Eye,
  EyeOff,
  HardDrive,
  X,
  Loader2,
  Cloud,
  Lock,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

/* ──────────── Types ──────────── */
interface User {
  id: string;
  username: string;
  createdAt: string;
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

/* ──────────── Helpers ──────────── */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <FileImage className="h-8 w-8 text-emerald-500" />;
  if (mimeType.startsWith('video/')) return <FileVideo className="h-8 w-8 text-violet-500" />;
  if (mimeType.startsWith('audio/')) return <FileAudio className="h-8 w-8 text-amber-500" />;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('gz'))
    return <Archive className="h-8 w-8 text-orange-500" />;
  if (mimeType.includes('pdf')) return <FileText className="h-8 w-8 text-red-500" />;
  if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('xml'))
    return <FileText className="h-8 w-8 text-sky-500" />;
  return <File className="h-8 w-8 text-muted-foreground" />;
}

function getFileExtension(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toUpperCase() : 'N/A';
}

function getShareUrl(shareId: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/download/${shareId}`;
  }
  return `/api/download/${shareId}`;
}

/* ──────────── Main Page ──────────── */
export default function FileVaultPage() {
  const { toast } = useToast();

  // Auth state
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Auth dialog state
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Files state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Restore token on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('fv_token');
      if (stored) {
        setAuthToken(stored);
        return;
      }
    } catch {}
    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, ...rest] = cookie.trim().split('=');
        if (name === 'fv_token') {
          const val = rest.join('=');
          if (val) {
            setAuthToken(val);
            break;
          }
        }
      }
    } catch {}
  }, []);

  // Fetch files (public, no auth needed)
  const fetchFiles = useCallback(async () => {
    try {
      setFilesLoading(true);
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error('Error al cargar archivos');
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar los archivos.', variant: 'destructive' });
    } finally {
      setFilesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Persist token
  const persistToken = (token: string | null) => {
    try { if (token) localStorage.setItem('fv_token', token); else localStorage.removeItem('fv_token'); } catch {}
    try { document.cookie = `fv_token=${token || ''}; path=/; max-age=${token ? 86400 * 30 : 0}`; } catch {}
  };

  // Handle auth submit
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (isRegister && authPassword !== authConfirmPassword) {
      setAuthError('Las contraseñas no coinciden.');
      return;
    }
    if (isRegister && authPassword.length < 6) {
      setAuthError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (isRegister && (authUsername.length < 3 || authUsername.length > 30)) {
      setAuthError('El usuario debe tener entre 3 y 30 caracteres.');
      return;
    }

    setAuthLoading(true);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Error en la autenticación.');
        return;
      }
      setAuthToken(data.token);
      setCurrentUser(data.user);
      persistToken(data.token);
      setAuthDialogOpen(false);
      setAuthUsername('');
      setAuthPassword('');
      setAuthConfirmPassword('');
      toast({
        title: isRegister ? 'Cuenta creada' : 'Bienvenido de vuelta',
        description: isRegister ? 'Tu cuenta ha sido creada exitosamente.' : `Hola, ${data.user.username}`,
      });
    } catch {
      setAuthError('Error de conexión. Intenta de nuevo.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    persistToken(null);
    toast({ title: 'Sesión cerrada', description: 'Has cerrado sesión correctamente.' });
  };

  // Handle file upload via presigned URL
  const handleUpload = async () => {
    if (!uploadFiles.length || !authToken) return;
    setUploading(true);
    const progressMap: Record<string, number> = {};
    let successCount = 0;

    for (const file of uploadFiles) {
      try {
        // Step 1: Get presigned URL
        const presignRes = await fetch(`/api/files/presign?token=${encodeURIComponent(authToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
        });
        const presignData = await presignRes.json();
        if (!presignRes.ok) throw new Error(presignData.error || 'Error al obtener URL de subida');

        // Step 2: Upload to R2 via presigned URL
        progressMap[file.name] = 10;
        setUploadProgress({ ...progressMap });

        const uploadRes = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!uploadRes.ok) throw new Error('Error al subir archivo a R2');

        progressMap[file.name] = 70;
        setUploadProgress({ ...progressMap });

        // Step 3: Confirm upload
        const confirmRes = await fetch(`/api/files/confirm?token=${encodeURIComponent(authToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            r2Key: presignData.r2Key,
            originalName: file.name,
            mimeType: file.type,
            size: file.size,
          }),
        });
        const confirmData = await confirmRes.json();
        if (!confirmRes.ok) throw new Error(confirmData.error || 'Error al confirmar subida');

        progressMap[file.name] = 100;
        setUploadProgress({ ...progressMap });
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        progressMap[file.name] = -1;
        setUploadProgress({ ...progressMap });
        toast({ title: 'Error al subir', description: `${file.name}: ${msg}`, variant: 'destructive' });
      }
    }

    setUploading(false);
    if (successCount > 0) {
      toast({ title: 'Subida completa', description: `${successCount} archivo(s) subido(s) correctamente.` });
      fetchFiles();
      setUploadDialogOpen(false);
      setUploadFiles([]);
      setUploadProgress({});
    }
  };

  // Handle delete — MUST use POST, not DELETE method (Android WebView compatibility)
  const handleDelete = async () => {
    if (!deleteTarget || !authToken) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/files?action=delete&id=${encodeURIComponent(deleteTarget.id)}&token=${encodeURIComponent(authToken)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || data.details || 'Error al eliminar el archivo';
        toast({ title: 'Error al eliminar', description: errMsg, variant: 'destructive' });
      } else {
        toast({ title: 'Archivo eliminado', description: `"${deleteTarget.originalName}" ha sido eliminado.` });
        fetchFiles();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      toast({ title: 'Error al eliminar', description: msg, variant: 'destructive' });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Handle copy share link
  const handleCopyLink = (shareId: string) => {
    const url = getShareUrl(shareId);
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast({ title: 'Enlace copiado', description: 'El enlace de descarga se ha copiado al portapapeles.' });
    } catch {
      toast({ title: 'Enlace', description: url });
    }
  };

  // Filtered files
  const filteredFiles = files.filter((f) =>
    f.originalName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const totalFiles = files.length;
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const totalDownloads = files.reduce((acc, f) => acc + f.downloads, 0);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-200/30 dark:bg-emerald-900/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-200/30 dark:bg-teal-900/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-100/20 dark:bg-emerald-900/10 rounded-full blur-3xl" />
      </div>

      {/* ──── Header ──── */}
      <header className="relative z-10 sticky top-0 backdrop-blur-xl bg-white/70 dark:bg-gray-950/70 border-b border-emerald-100 dark:border-emerald-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30">
                <Cloud className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  File<span className="text-emerald-600 dark:text-emerald-400">Vault</span>
                </h1>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {currentUser && authToken ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3"
                >
                  {/* User badge */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center justify-center w-6 h-6 bg-emerald-600 text-white text-xs font-bold rounded-full">
                      {currentUser.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300 hidden sm:inline">
                      {currentUser.username}
                    </span>
                  </div>

                  {/* Upload button */}
                  <Button
                    onClick={() => { setUploadDialogOpen(true); setUploadFiles([]); setUploadProgress({}); }}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30"
                  >
                    <CloudUpload className="h-4 w-4 mr-2" />
                    Subir archivos
                  </Button>

                  {/* Logout */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLogout}
                    className="text-muted-foreground hover:text-red-500"
                    title="Cerrar sesión"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </motion.div>
              ) : (
                <Dialog open={authDialogOpen} onOpenChange={(open) => { setAuthDialogOpen(open); if (!open) { setAuthError(''); setAuthUsername(''); setAuthPassword(''); setAuthConfirmPassword(''); setIsRegister(false); } }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50">
                      <Lock className="h-4 w-4 mr-2" />
                      Admin
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md border-emerald-100 dark:border-emerald-900/50">
                    <DialogHeader>
                      <DialogTitle className="text-xl">
                        {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
                      </DialogTitle>
                      <DialogDescription>
                        {isRegister
                          ? 'Crea tu cuenta para gestionar archivos.'
                          : 'Ingresa tus credenciales para acceder.'}
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAuthSubmit} className="space-y-4 mt-2">
                      {authError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400"
                        >
                          {authError}
                        </motion.div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="auth-username">Usuario</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="auth-username"
                            placeholder="tu_usuario"
                            value={authUsername}
                            onChange={(e) => setAuthUsername(e.target.value)}
                            required
                            autoComplete="username"
                            className="pl-9 h-11"
                            disabled={authLoading}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="auth-password">Contraseña</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="auth-password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            required
                            autoComplete={isRegister ? 'new-password' : 'current-password'}
                            className="pl-9 pr-10 h-11"
                            disabled={authLoading}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {isRegister && (
                        <div className="space-y-2">
                          <Label htmlFor="auth-confirm-password">Confirmar contraseña</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="auth-confirm-password"
                              type={showConfirmPassword ? 'text' : 'password'}
                              placeholder="••••••••"
                              value={authConfirmPassword}
                              onChange={(e) => setAuthConfirmPassword(e.target.value)}
                              required
                              autoComplete="new-password"
                              className="pl-9 pr-10 h-11"
                              disabled={authLoading}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              tabIndex={-1}
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      )}

                      <Button
                        type="submit"
                        className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
                        disabled={authLoading}
                      >
                        {authLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Procesando...
                          </>
                        ) : isRegister ? (
                          'Registrarse'
                        ) : (
                          'Iniciar sesión'
                        )}
                      </Button>

                      <div className="text-center text-sm">
                        <button
                          type="button"
                          onClick={() => { setIsRegister(!isRegister); setAuthError(''); }}
                          className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                        >
                          {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
                        </button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ──── Main Content ──── */}
      <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <Card className="border-0 shadow-lg shadow-black/5 dark:shadow-black/20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg">
                  <FolderOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Archivos</p>
                  <p className="text-2xl font-bold text-foreground">{totalFiles}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg shadow-black/5 dark:shadow-black/20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-teal-100 dark:bg-teal-900/40 rounded-lg">
                  <HardDrive className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Almacenado</p>
                  <p className="text-2xl font-bold text-foreground">{formatBytes(totalSize)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg shadow-black/5 dark:shadow-black/20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-violet-100 dark:bg-violet-900/40 rounded-lg">
                  <Download className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Descargas</p>
                  <p className="text-2xl font-bold text-foreground">{totalDownloads}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg shadow-black/5 dark:shadow-black/20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-amber-100 dark:bg-amber-900/40 rounded-lg">
                  <Link2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Enlaces activos</p>
                  <p className="text-2xl font-bold text-foreground">{totalFiles}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Search & Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6"
        >
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Todos los archivos
            </h2>
            <p className="text-muted-foreground mt-1">
              {filteredFiles.length} archivo{filteredFiles.length !== 1 ? 's' : ''} disponible{filteredFiles.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar archivos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-emerald-100 dark:border-emerald-900/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </motion.div>

        {/* Files Grid */}
        {filesLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="flex items-center justify-center w-16 h-16 bg-muted rounded-2xl mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {searchQuery ? 'Sin resultados' : 'No hay archivos'}
            </h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'Intenta con otro término de búsqueda.' : 'Los archivos subidos aparecerán aquí.'}
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredFiles.map((file) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="group border-0 shadow-lg shadow-black/5 dark:shadow-black/20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm hover:shadow-xl transition-shadow duration-300 h-full">
                    <CardContent className="p-4 sm:p-6 flex flex-col h-full">
                      {/* Top: icon + actions */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex-shrink-0">
                            {getFileIcon(file.mimeType)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate" title={file.originalName}>
                              {file.originalName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {file.user?.username && (
                                <span className="mr-2">por {file.user.username}</span>
                              )}
                              {formatDate(file.createdAt)}
                            </p>
                          </div>
                        </div>
                        {authToken && currentUser && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(file)}
                            className="flex-shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 h-8 w-8"
                            title="Eliminar archivo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <Badge variant="secondary" className="text-xs font-medium">
                          {getFileExtension(file.originalName)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {formatBytes(file.size)}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                          <Eye className="h-3.5 w-3.5" />
                          <span>{file.downloads}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-auto flex items-center gap-2">
                        <Button asChild className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm h-9">
                          <a href={`/api/download/${file.shareId}`} download>
                            <Download className="h-4 w-4 mr-1.5" />
                            Descargar
                          </a>
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleCopyLink(file.shareId)}
                          className="h-9 w-9 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                          title="Copiar enlace"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* ──── Upload Dialog ──── */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => { setUploadDialogOpen(open); if (!open) { setUploadFiles([]); setUploadProgress({}); } }}>
        <DialogContent className="sm:max-w-lg border-emerald-100 dark:border-emerald-900/50">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <CloudUpload className="h-5 w-5 text-emerald-600" />
              Subir archivos
            </DialogTitle>
            <DialogDescription>
              Selecciona los archivos que deseas subir al servidor.
            </DialogDescription>
          </DialogHeader>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-emerald-200 dark:border-emerald-800 rounded-xl p-8 text-center cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
          >
            <Upload className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              Haz clic para seleccionar archivos
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              o arrastra los archivos aquí
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  setUploadFiles(Array.from(e.target.files));
                }
              }}
            />
          </div>

          {/* File list */}
          <AnimatePresence>
            {uploadFiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 max-h-48 overflow-y-auto"
              >
                {uploadFiles.map((file, i) => {
                  const progress = uploadProgress[file.name];
                  const isDone = progress === 100;
                  const isError = progress === -1;
                  return (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                    >
                      <div className="flex-shrink-0">{getFileIcon(file.type)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                        {progress !== undefined && progress >= 0 && (
                          <Progress value={progress} className="h-1.5 mt-1" />
                        )}
                      </div>
                      {isDone && <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                      {isError && <X className="h-4 w-4 text-red-500 flex-shrink-0" />}
                      {!uploading && (
                        <button
                          onClick={() => setUploadFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-red-500 flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-end gap-3 mt-2">
            <Button
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
              disabled={uploading}
              className="border-emerald-200 dark:border-emerald-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadFiles.length === 0 || uploading}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <CloudUpload className="h-4 w-4 mr-2" />
                  Subir {uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ──── Delete Confirmation Dialog ──── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-red-100 dark:border-red-900/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Eliminar archivo
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar{" "}
              <span className="font-semibold text-foreground">"{deleteTarget?.originalName}"</span>?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ──── Footer ──── */}
      <footer className="relative z-10 mt-auto border-t border-emerald-100 dark:border-emerald-900/30 bg-white/50 dark:bg-gray-950/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-emerald-500" />
            <span>FileVault v3.5</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-emerald-500" />
            <span>Almacenamiento seguro y rápido</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ──────────── Small search icon component ──────────── */
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}