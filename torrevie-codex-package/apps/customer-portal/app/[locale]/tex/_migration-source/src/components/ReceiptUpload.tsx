import React, { useCallback, useState, useRef } from 'react';
import { Upload, Camera, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/api';

interface ReceiptUploadProps {
  companyId: string;
  onUploadComplete: (url: string) => void;
  onFileReady: (file: File) => void;
  uploadedUrl: string | null;
}

const ACCEPTED = '.jpeg,.jpg,.png,.heic,.pdf';
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Could not read receipt file'));
  reader.readAsDataURL(file);
});

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ companyId, onUploadComplete, onFileReady, uploadedUrl }) => {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > MAX_SIZE) {
      toast.error('File is too large. Maximum size is 20MB.');
      return;
    }

    setUploading(true);
    setFileName(file.name);
    setFileSize(formatSize(file.size));

    try {
      const dataUrl = await fileToDataUrl(file);
      if (file.type.startsWith('image/')) setPreview(dataUrl);
      else setPreview(null);

      const data = await apiRequest<{ receipt: { url: string } }>('/api/tex/receipts', {
        method: 'POST',
        body: JSON.stringify({
          company_id: companyId,
          file_name: file.name,
          content_type: file.type || 'application/octet-stream',
          data_base64: dataUrl,
        }),
      });
      onUploadComplete(data.receipt.url);
      onFileReady(file);
      toast.success('Receipt uploaded');
    } catch (error) {
      setPreview(null);
      setFileName(null);
      setFileSize(null);
      onUploadComplete('');
      toast.error((error as Error).message || 'Receipt upload failed');
    } finally {
      setUploading(false);
    }
  }, [companyId, onUploadComplete, onFileReady]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const clearUpload = () => {
    setPreview(null);
    setFileName(null);
    setFileSize(null);
    onUploadComplete('');
  };

  if (uploadedUrl) {
    return (
      <div className="bg-card rounded-lg border p-4">
        <div className="flex items-start gap-4">
          {preview ? (
            <img src={preview} alt="Receipt" className="h-24 w-24 object-cover rounded-md border" />
          ) : (
            <div className="h-24 w-24 rounded-md border bg-muted flex items-center justify-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground">{fileSize}</p>
            <p className="text-xs text-primary mt-1">Uploaded to TEX</p>
          </div>
          <Button variant="ghost" size="icon" onClick={clearUpload} className="flex-shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
          uploading && 'opacity-50 pointer-events-none'
        )}
      >
        <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">
          {uploading ? 'Preparing...' : 'Drop receipt here or click to upload'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, HEIC, PDF - up to 20MB</p>
      </div>

      {/* Mobile camera button */}
      <div className="mt-3 md:hidden">
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-md"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="mr-2 h-4 w-4" /> Take Photo
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};

export default ReceiptUpload;
