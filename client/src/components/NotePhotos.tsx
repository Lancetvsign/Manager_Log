import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl, useManagerLog } from "@/contexts/ManagerLogContext";
import { Camera, X, Loader2, ExternalLink } from "lucide-react";
import type { NotePhoto } from "@shared/schema";
import { format } from "date-fns";

interface NotePhotosProps {
  logId: number | null;
  noteType: "operational" | "maintenance";
  disabled?: boolean;
  currentDate?: string; // YYYY-MM-DD format - for auto-creating log
  onLogCreated?: (logId: number) => void; // Callback when log is auto-created
}

export function NotePhotos({ logId, noteType, disabled, currentDate, onLogCreated }: NotePhotosProps) {
  const { clubId, apiBaseUrl } = useManagerLog();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localLogId, setLocalLogId] = useState<number | null>(logId);
  
  // Use provided logId or locally created one
  const effectiveLogId = logId ?? localLogId;

  const { data: photos = [], isLoading } = useQuery<NotePhoto[]>({
    queryKey: ['/api/logs', effectiveLogId, 'note-photos', noteType, clubId],
    queryFn: async () => {
      if (!effectiveLogId) return [];
      const url = buildApiUrl(`/api/logs/${effectiveLogId}/note-photos`, clubId, apiBaseUrl, { noteType });
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch photos');
      return response.json();
    },
    enabled: !!effectiveLogId,
  });
  
  // Auto-create log if needed for photo upload
  const ensureLogExists = async (): Promise<number | null> => {
    if (effectiveLogId) return effectiveLogId;
    if (!currentDate) return null;
    
    try {
      const res = await fetch(`${apiBaseUrl}/api/logs/ensure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          date: currentDate,
          managerName: "Auto-created for photo",
        }),
      });
      
      if (!res.ok) throw new Error("Failed to create log");
      
      const data = await res.json();
      setLocalLogId(data.logId);
      onLogCreated?.(data.logId);
      return data.logId;
    } catch (error) {
      console.error("Failed to ensure log exists:", error);
      return null;
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const url = buildApiUrl(`/api/note-photos/${photoId}`, clubId, apiBaseUrl);
      const response = await fetch(url, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete photo');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/logs', effectiveLogId, 'note-photos'] });
      toast({ title: "Photo deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete photo", variant: "destructive" });
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be less than 5MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      // Ensure we have a log ID (auto-create if needed)
      const uploadLogId = await ensureLogExists();
      if (!uploadLogId) {
        toast({ title: "Unable to create log entry. Please save the log first.", variant: "destructive" });
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('noteType', noteType);

      const url = buildApiUrl(`/api/logs/${uploadLogId}/note-photos`, clubId, apiBaseUrl);
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      queryClient.invalidateQueries({ queryKey: ['/api/logs', uploadLogId, 'note-photos'] });
      toast({ title: "Photo uploaded successfully" });
    } catch (error) {
      toast({ title: "Failed to upload photo", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Allow uploads if we have a logId OR if we have currentDate (can auto-create)
  const canUpload = !disabled && (effectiveLogId || currentDate);

  const hasPhotos = photos.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
          disabled={!canUpload || uploading}
          data-testid={`input-photo-${noteType}`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canUpload || uploading}
          data-testid={`button-add-photo-${noteType}`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Camera className="h-4 w-4 mr-2" />
          )}
          {uploading ? "Uploading..." : "Add Photo"}
        </Button>
        {!isLoading && !hasPhotos && (
          <span className="text-xs text-muted-foreground">
            {canUpload ? "No photos attached" : "Save log first to add photos"}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading photos...
        </div>
      ) : hasPhotos && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative group rounded-lg overflow-hidden border bg-muted/20"
              data-testid={`photo-${photo.id}`}
            >
              <img
                src={photo.url}
                alt="Note photo"
                className="w-full h-24 object-cover"
              />
              {!disabled && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteMutation.mutate(photo.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-photo-${photo.id}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
