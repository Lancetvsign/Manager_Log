import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Plus, Loader2, Wrench, Clock, Calendar, Camera, X, Image } from "lucide-react";
import type { RunningMaintenanceItem } from "@shared/schema";

interface RunningMaintenanceListProps {
  showCompleted?: boolean;
}

export default function RunningMaintenanceList({ showCompleted = false }: RunningMaintenanceListProps) {
  const { clubId, apiBaseUrl } = useManagerLog();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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
    mutationFn: async (data: { title: string; description?: string; photo?: File }) => {
      const formData = new FormData();
      formData.append("title", data.title);
      if (data.description) {
        formData.append("description", data.description);
      }
      if (data.photo) {
        formData.append("photo", data.photo);
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
      setTitle("");
      setDescription("");
      setPhotoFile(null);
      setPhotoPreview(null);
      setIsAdding(false);
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
    if (!title.trim()) return;
    addMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      photo: photoFile || undefined,
    });
  };

  const openItems = items.filter((item) => item.status === "open");
  const completedItems = items.filter((item) => item.status === "completed");

  return (
    <Card data-testid="card-running-maintenance">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Running Maintenance List
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {openItems.length} open {openItems.length === 1 ? "item" : "items"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Open items sorted oldest to newest
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {isAdding ? (
          <form onSubmit={handleAdd} className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="maintenance-title">Title</Label>
              <Input
                id="maintenance-title"
                type="text"
                placeholder="Short maintenance item title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                data-testid="input-maintenance-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-description">Description (optional)</Label>
              <Textarea
                id="maintenance-description"
                placeholder="Optional description or details"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="resize-none"
                data-testid="input-maintenance-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Photo (optional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
                id="maintenance-photo"
                data-testid="input-maintenance-photo"
              />
              {photoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="h-20 w-20 object-cover rounded-md border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
                    onClick={clearPhoto}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Add Photo
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={!title.trim() || addMutation.isPending}
                data-testid="button-add-maintenance-submit"
              >
                {addMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Item"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setTitle("");
                  setDescription("");
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                data-testid="button-cancel-maintenance"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="w-full"
            data-testid="button-add-maintenance"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Maintenance Item
          </Button>
        )}

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
                  <a href={item.photoUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <img
                      src={item.photoUrl}
                      alt={item.title}
                      className="h-16 w-16 object-cover rounded-md border hover:opacity-80 transition-opacity"
                    />
                  </a>
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
                    {item.relatedLogDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Log: {item.relatedLogDate}
                      </span>
                    )}
                    {item.photoUrl && (
                      <span className="flex items-center gap-1">
                        <Image className="h-3 w-3" />
                        Has photo
                      </span>
                    )}
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
                    <a href={item.photoUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                      <img
                        src={item.photoUrl}
                        alt={item.title}
                        className="h-12 w-12 object-cover rounded-md border opacity-70"
                      />
                    </a>
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
    </Card>
  );
}
