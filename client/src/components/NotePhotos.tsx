import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl, useManagerLog } from "@/contexts/ManagerLogContext";
import { Camera, X, Loader2, Image } from "lucide-react";
import type { NotePhoto } from "@shared/schema";

interface NotePhotosProps {
  logId: number | null;
  noteType: "operational" | "maintenance";
  disabled?: boolean;
}

export function NotePhotos({ logId, noteType, disabled }: NotePhotosProps) {
  const { clubId, apiBaseUrl } = useManagerLog();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: photos = [], isLoading } = useQuery<NotePhoto[]>({
    queryKey: ['/api/logs', logId, 'note-photos', noteType, clubId],
    queryFn: async () => {
      if (!logId) return [];
      const url = buildApiUrl(`/api/logs/${logId}/note-photos`, clubId, apiBaseUrl, { noteType });
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch photos');
      return response.json();
    },
    enabled: !!logId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const url = buildApiUrl(`/api/note-photos/${photoId}`, clubId, apiBaseUrl);
      const response = await fetch(url, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete photo');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/logs', logId, 'note-photos'] });
      toast({ title: "Photo deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete photo", variant: "destructive" });
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !logId) return;

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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('noteType', noteType);

      const url = buildApiUrl(`/api/logs/${logId}/note-photos`, clubId, apiBaseUrl);
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      queryClient.invalidateQueries({ queryKey: ['/api/logs', logId, 'note-photos'] });
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

  if (!logId) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Save the log first to add photos
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          data-testid={`input-photo-${noteType}`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          data-testid={`button-add-photo-${noteType}`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Camera className="h-4 w-4 mr-2" />
          )}
          {uploading ? "Uploading..." : "Add Photo"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading photos...
        </div>
      ) : photos.length > 0 ? (
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
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Image className="h-4 w-4" />
          No photos attached
        </div>
      )}
    </div>
  );
}
