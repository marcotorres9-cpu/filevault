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
  HardDrive,
  X,
  Loader2,
  Cloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  fileCount?: number;
}

interface FileItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  shareId: string;
  downloads: number;
  createdAt: string;
}

type View = 'auth' | 'dashboard';

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

/* ──────────── Auth Component ──────────── */
function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isRegister && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (isRegister && password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (isRegister && (username.length < 3 || username.length > 30)) {
      setError('El usuario debe tener entre 3 y 30 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error en la autenticación.');
        return;
      }

      toast({
        title: isRegister ? 'Cuenta creada' : 'Bienvenido de vuelta',
        description: isRegister ? 'Tu cuenta ha sido creada exitosamente.' : `Hola, ${data.user.username}`,
      });

      onLogin(data.user);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-200/30 dark:bg-emerald-900/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-200/30 dark:bg-teal-900/20 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl mb-4 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30"
          >
            <Cloud className="h-8 w-8 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">FileVault</h1>
          <p className="text-muted-foreground mt-1">Tu plataforma de archivos personal</p>
        </div>

        <Card className="border-0 shadow-xl shadow-black/5 dark:shadow-black/20">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </CardTitle>
            <CardDescription>
              {isRegister
                ? 'Crea tu cuenta para empezar a subir archivos.'
                : 'Ingresa tus credenciales para acceder.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400"
                >
                  {error}
                </motion.div>
              )}

              <div className="space-y-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  placeholder="tu_usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="h-11"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className="h-11"
                  disabled={loading}
                />
              </div>

              {isRegister && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <Label htmlFor="confirm">Confirmar contraseña</Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-11"
                    disabled={loading}
                  />
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : isRegister ? (
                  'Crear cuenta'
                ) : (
                  'Iniciar sesión'
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError('');
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            <span>Seguro</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            <span>Rápido</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Cloud className="h-3.5 w-3.5" />
            <span>Gratis</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ──────────── Upload Dialog ──────────── */
function UploadDialog({ onUploaded }: { onUploaded: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setFiles((prev) => [...prev, ...Array.from(fileList)]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const upload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append('file', files[i]);

      try {
        const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setUploading(false);
    setFiles([]);

    if (success > 0) {
      toast({
        title: `${success} archivo${success > 1 ? 's' : ''} subido${success > 1 ? 's' : ''}`,
        description: failed > 0 ? `${failed} archivo${failed > 1 ? 's' : ''} falló.` : 'Todos los archivos se subieron correctamente.',
        variant: failed > 0 ? 'default' : 'default',
      });
      onUploaded();
    }

    if (failed > 0 && success === 0) {
      toast({
        title: 'Error',
        description: 'No se pudieron subir los archivos.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-11 gap-2">
          <Upload className="h-4 w-4" />
          Subir archivos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir archivos</DialogTitle>
          <DialogDescription>
            Arrastra archivos aquí o haz clic para seleccionar. Máximo 100MB por archivo.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragActive
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
              : 'border-muted-foreground/25 hover:border-emerald-400 hover:bg-muted/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <CloudUpload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Arrastra archivos aquí</p>
          <p className="text-xs text-muted-foreground mt-1">o haz clic para seleccionar</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                {getFileIcon(f.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {uploading && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">{progress}% completado</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setFiles([])}
            disabled={uploading || files.length === 0}
          >
            Limpiar
          </Button>
          <Button
            onClick={upload}
            disabled={uploading || files.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Subir {files.length > 0 ? `(${files.length})` : ''}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────── File Card ──────────── */
function FileCard({
  file,
  onDelete,
}: {
  file: FileItem;
  onDelete: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  const shareUrl = getShareUrl(file.shareId);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: 'Enlace copiado', description: 'El enlace de descarga está en tu portapapeles.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Error', description: 'No se pudo copiar el enlace.', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/files?id=${file.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Eliminado', description: 'El archivo ha sido eliminado.' });
        onDelete(file.id);
      } else {
        toast({ title: 'Error', description: 'No se pudo eliminar el archivo.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Error de conexión.', variant: 'destructive' });
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        layout
        className="group"
      >
        <Card className="hover:shadow-md transition-shadow border-border/60">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">{getFileIcon(file.mimeType)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" title={file.originalName}>
                  {file.originalName}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary" className="text-xs font-normal">
                    {getFileExtension(file.originalName)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{formatDate(file.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  <span>{file.downloads} descarga{file.downloads !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>

            <Separator className="my-3" />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 text-xs gap-1.5"
                onClick={() => window.open(`/api/files/${file.id}/download`, '_blank')}
              >
                <Download className="h-3.5 w-3.5" />
                Descargar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 text-xs gap-1.5"
                onClick={copyLink}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado' : 'Copiar enlace'}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteDialog(true)}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar archivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar &quot;{file.originalName}&quot;. Esta acción no se puede deshacer y el enlace de
              descarga dejará de funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ──────────── Dashboard Component ──────────── */
function Dashboard({ user: initialUser, onLogout }: { user: User; onLogout: () => void }) {
  const [user, setUser] = useState<User>(initialUser);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ totalFiles: 0, totalSize: 0, totalDownloads: 0 });
  const { toast } = useToast();

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files);
        setStats({
          totalFiles: data.files.length,
          totalSize: data.files.reduce((acc: number, f: FileItem) => acc + f.size, 0),
          totalDownloads: data.files.reduce((acc: number, f: FileItem) => acc + f.downloads, 0),
        });
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar los archivos.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleLogout = async () => {
    await fetch('/api/auth/me', { method: 'POST' });
    onLogout();
  };

  const handleDeleteFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    loadFiles();
  };

  const filteredFiles = files.filter((f) =>
    f.originalName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-emerald-50/30 dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 bg-emerald-600 rounded-xl">
              <Cloud className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">FileVault</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm">
              <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {user.username[0].toUpperCase()}
              </div>
              <span className="font-medium">{user.username}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {[
            { label: 'Archivos', value: stats.totalFiles, icon: FolderOpen, color: 'text-emerald-600' },
            { label: 'Almacenado', value: formatBytes(stats.totalSize), icon: HardDrive, color: 'text-sky-600' },
            { label: 'Descargas', value: stats.totalDownloads, icon: Download, color: 'text-violet-600' },
            { label: 'Enlaces activos', value: stats.totalFiles, icon: Link2, color: 'text-amber-600' },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold">Mis archivos</h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              placeholder="Buscar archivos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 flex-1 sm:w-64"
            />
            <UploadDialog onUploaded={loadFiles} />
          </div>
        </div>

        {/* File list */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-muted rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-2xl mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {searchTerm ? 'Sin resultados' : 'No hay archivos aún'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm
                ? `No se encontraron archivos que coincidan con "${searchTerm}".`
                : 'Sube tu primer archivo para comenzar.'}
            </p>
            {!searchTerm && (
              <UploadDialog onUploaded={loadFiles} />
            )}
          </motion.div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filteredFiles.map((file) => (
                <FileCard key={file.id} file={file} onDelete={handleDeleteFile} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-background/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>FileVault — Tu almacenamiento en la nube personal</span>
          <span>Powered by Next.js</span>
        </div>
      </footer>
    </div>
  );
}

/* ──────────── Main Page ──────────── */
export default function HomePage() {
  const [view, setView] = useState<View>('auth');
  const [user, setUser] = useState<User | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then((data) => {
        setUser(data.user);
        setView('dashboard');
      })
      .catch(() => {
        setView('auth');
      })
      .finally(() => setInitialLoading(false));
  }, []);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setView('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setView('auth');
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl mb-4 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30">
            <Cloud className="h-8 w-8 text-white" />
          </div>
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {view === 'auth' ? (
        <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <AuthScreen onLogin={handleLogin} />
        </motion.div>
      ) : (
        user && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Dashboard user={user} onLogout={handleLogout} />
          </motion.div>
        )
      )}
    </AnimatePresence>
  );
}