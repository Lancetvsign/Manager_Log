import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle2, Plus, Loader2, Wrench, Clock, Camera, X } from "lucide-react";
import type { RunningMaintenanceItem } from "@shared/schema";

interface RunningMaintenanceListProps {
  showCompleted?: boolean;
}

export default function RunningMaintenanceList({ showCompleted = false }: RunningMaintenanceListProps) {
  const { clubId, apiBaseUrl } = useManagerLog();
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"open" | "completed">("open");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useQuery<RunningMaintenanceItem[]>({
    queryKey: ["/api/running-maintenance", clubId, showCompleted ? "all" : "open"],
    queryFn: async () => {
      const additionalParams: Record<string, string> = showCompleted ? {} : { status: "open" };
      const response = await fetch(
        buildApiUrl("/api/running-maintenance", clubId, apiBaseUrl, additionalParams)
      );
      if (!response.ok) throw new Error("Failed to fetch maintenance items");
      return response.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; photo?: File; status?: string }) => {
      const formData = new FormData();
      formData.append("title", data.title);
      if (data.description) {
        formData.append("description", data.description);
      }
      if (data.photo) {
        formData.append("photo", data.photo);
      }
      if (data.status) {
        formData.append("status", data.status);
      }

      const url = buildApiUrl("/api/running-maintenance", clubId, apiBaseUrl);
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("Failed to add maintenance item");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance", clubId] });
      setDescription("");
      setNotes("");
      setStatus("open");
      setPhotoFile(null);
      setPhotoPreview(null);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(
        "PATCH",
        buildApiUrl(`/api/running-maintenance/${id}`, clubId, apiBaseUrl),
        { status: "completed" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance", clubId] });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(
        "PATCH",
        buildApiUrl(`/api/running-maintenance/${id}`, clubId, apiBaseUrl),
        { status: "open" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance", clubId] });
    },
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    addMutation.mutate({
      title: description.trim(),
      description: notes.trim() || undefined,
      photo: photoFile || undefined,
      status: status,
    });
  };

  const openLightbox = (src: string) => {
    setLightboxSrc(src);
    setLightboxOpen(true);
  };

  const openItems = items.filter((item) => item.status === "open");
  const completedItems = items.filter((item) => item.status === "completed");

  return (
    <Card data-testid="card-running-maintenance">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              Running Maintenance List
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Showing all open items · oldest to newest
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {openItems.length} open {openItems.length === 1 ? "item" : "items"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Add Item Form - Horizontal Layout */}
        <form onSubmit={handleAdd} className="space-y-3">
          {/* TOP ROW: Description, Status, Photo, Add Item */}
          <div className="flex flex-wrap gap-3 items-end">
            {/* Description */}
            <div className="flex-1 min-w-[240px]">
              <Label className="text-xs mb-1 block">Description</Label>
              <Input
                type="text"
                placeholder="Enter maintenance item description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="input-maintenance-description"
              />
            </div>

            {/* Status */}
            <div className="w-[160px]">
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "open" | "completed")}>
                <SelectTrigger data-testid="select-maintenance-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Photo */}
            <div className="w-[220px]">
              <Label className="text-xs mb-1 block">Photo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
                id="maintenance-photo"
                data-testid="input-maintenance-photo"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1"
                >
                  <Camera className="h-3 w-3" />
                  {photoPreview ? "Change Photo" : "Add Photo"}
                </Button>
                {photoPreview && (
                  <div className="flex items-center gap-2">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="h-9 w-9 rounded-md object-cover border cursor-pointer hover:ring-2 hover:ring-primary"
                      onClick={() => openLightbox(photoPreview)}
                    />
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Add Item Button */}
            <div className="w-[140px]">
              <Button
                type="submit"
                className="w-full"
                disabled={!description.trim() || addMutation.isPending}
                data-testid="button-add-maintenance-submit"
              >
                {addMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* NOTES ROW: full width */}
          <div>
            <Label className="text-xs mb-1 block">Notes</Label>
            <Input
              type="text"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="input-maintenance-notes"
            />
          </div>
        </form>

        {/* Items List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Loading items...</span>
          </div>
        ) : openItems.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No open maintenance items</p>
          </div>
        ) : (
          <div className="space-y-2">
            {openItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 p-3 border rounded-lg bg-background"
                data-testid={`maintenance-item-${item.id}`}
              >
                {item.photoUrl && (
                  <img
                    src={item.photoUrl}
                    alt={item.title}
                    className="h-16 w-16 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                    onClick={() => openLightbox(item.photoUrl!)}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{item.title}</div>
                  {item.description && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {item.description}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Added: {new Date(item.dateAdded).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => completeMutation.mutate(item.id)}
                  disabled={completeMutation.isPending}
                  data-testid={`button-complete-${item.id}`}
                >
                  {completeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Done
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}

        {showCompleted && completedItems.length > 0 && (
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Completed Items ({completedItems.length})
            </h4>
            <div className="space-y-2">
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 p-3 border rounded-lg bg-muted/30 opacity-70"
                  data-testid={`maintenance-item-completed-${item.id}`}
                >
                  {item.photoUrl && (
                    <img
                      src={item.photoUrl}
                      alt={item.title}
                      className="h-12 w-12 object-cover rounded-md border opacity-70 cursor-pointer flex-shrink-0"
                      onClick={() => openLightbox(item.photoUrl!)}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm line-through">{item.title}</div>
                    {item.description && (
                      <div className="text-sm text-muted-foreground mt-1 line-through">
                        {item.description}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>
                        Completed: {item.dateCompleted ? new Date(item.dateCompleted).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => reopenMutation.mutate(item.id)}
                    disabled={reopenMutation.isPending}
                    data-testid={`button-reopen-${item.id}`}
                  >
                    Reopen
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Photo Lightbox Modal */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-none">
          {lightboxSrc && (
            <img
              src={lightboxSrc}
              alt="Full size preview"
              className="max-h-[85vh] max-w-full mx-auto rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
