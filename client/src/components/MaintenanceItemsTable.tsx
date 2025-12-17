import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Camera, Loader2 } from "lucide-react";
import { useState } from "react";

interface MaintenanceItem {
  id: number;
  itemId?: number;
  description: string;
  status: string;
  notes: string | null;
  createdAt?: string;
  photoUrl?: string | null;
  logDate?: string;
  resolvedAt?: string | null;
}

interface MaintenanceItemsTableProps {
  items: MaintenanceItem[];
  isLoading?: boolean;
  showDateAdded?: boolean;
  showPhoto?: boolean;
  showActions?: boolean;
  onToggleStatus?: (itemId: number, currentStatus: string) => Promise<void>;
  onUploadPhoto?: (itemId: number, file: File) => Promise<void>;
  emptyMessage?: string;
  apiBaseUrl?: string;
}

export function MaintenanceItemsTable({
  items,
  isLoading = false,
  showDateAdded = false,
  showPhoto = false,
  showActions = false,
  onToggleStatus,
  onUploadPhoto,
  emptyMessage = "No maintenance items found.",
}: MaintenanceItemsTableProps) {
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const handleToggleStatus = async (item: MaintenanceItem) => {
    if (!onToggleStatus) return;
    const itemId = item.itemId ?? item.id;
    setTogglingId(itemId);
    try {
      await onToggleStatus(itemId, item.status);
    } finally {
      setTogglingId(null);
    }
  };

  const handlePhotoChange = async (item: MaintenanceItem, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadPhoto) return;
    
    const itemId = item.itemId ?? item.id;
    setUploadingId(itemId);
    try {
      await onUploadPhoto(itemId, file);
    } finally {
      setUploadingId(null);
      e.target.value = "";
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatCompletedAt = (completedAt: string | null | undefined) => {
    if (!completedAt) return "";
    const d = new Date(completedAt);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return d.toLocaleDateString(undefined, { 
      month: "short", 
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Loading items...</span>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        {emptyMessage}
      </p>
    );
  }

  const getColSpan = () => {
    let descriptionSpan = 5;
    if (showDateAdded) descriptionSpan -= 2;
    if (showPhoto) descriptionSpan -= 2;
    if (showActions) descriptionSpan -= 1;
    return Math.max(2, descriptionSpan);
  };

  return (
    <div className="border rounded-lg divide-y overflow-x-auto">
      <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium min-w-[600px]">
        {showDateAdded && <div className="col-span-2">Date Added</div>}
        <div className={`col-span-${showDateAdded ? '3' : getColSpan()}`}>Description</div>
        <div className="col-span-2">Status</div>
        <div className={`col-span-${showPhoto || showActions ? '3' : '5'}`}>Notes</div>
        {showPhoto && <div className="col-span-2">Photo</div>}
        {showActions && <div className="col-span-1 text-right">Actions</div>}
      </div>
      {items.map((item) => {
        const itemId = item.itemId ?? item.id;
        const isOpen = item.status === "open";
        
        return (
          <div
            key={item.id}
            className="grid grid-cols-12 gap-2 p-3 items-center min-w-[600px]"
            data-testid={`maintenance-item-${itemId}`}
          >
            {showDateAdded && (
              <div className="col-span-2 text-xs text-muted-foreground">
                {formatDate(item.logDate ?? item.createdAt)}
              </div>
            )}
            <div className={`col-span-${showDateAdded ? '3' : getColSpan()} text-sm`}>
              {item.description}
            </div>
            <div className="col-span-2">
              <div className="flex flex-col gap-1">
                <Badge
                  variant={isOpen ? "secondary" : "default"}
                  className={`flex items-center gap-1 w-fit ${
                    isOpen 
                      ? "text-green-700 border-green-300 bg-green-50" 
                      : ""
                  }`}
                >
                  {isOpen ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : (
                    <CheckCircle className="h-3 w-3" />
                  )}
                  {isOpen ? "Open" : "Completed"}
                </Badge>
                {!isOpen && item.resolvedAt && (
                  <span className="text-[11px] text-muted-foreground">
                    {formatCompletedAt(item.resolvedAt)}
                  </span>
                )}
              </div>
            </div>
            <div className={`col-span-${showPhoto || showActions ? '3' : '5'} text-sm text-muted-foreground`}>
              {item.notes || "-"}
            </div>
            {showPhoto && (
              <div className="col-span-2">
                {item.photoUrl ? (
                  <a
                    href={item.photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-block"
                    data-testid={`link-photo-${itemId}`}
                  >
                    <img
                      src={item.photoUrl}
                      alt={`Photo for ${item.description}`}
                      className="h-10 w-10 rounded object-cover border border-border/50 group-hover:border-teal-500 transition-colors"
                      data-testid={`img-maintenance-photo-${itemId}`}
                    />
                  </a>
                ) : onUploadPhoto ? (
                  <label className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                    <Camera className="h-3 w-3" />
                    {uploadingId === itemId ? "Uploading..." : "Add photo"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoChange(item, e)}
                      className="hidden"
                      disabled={uploadingId === itemId}
                    />
                  </label>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </div>
            )}
            {showActions && (
              <div className="col-span-1 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleStatus(item)}
                  disabled={togglingId === itemId}
                  data-testid={`button-toggle-status-${itemId}`}
                >
                  {togglingId === itemId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
