import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Paperclip, Trash2, FileText, Image, File as FileIcon, Download, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LogAttachment } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface FileAttachmentsProps {
  logId: number | null;
  clubId: string;
  readOnly?: boolean;
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) {
    return <Image className="h-4 w-4" />;
  }
  if (fileType.includes("pdf") || fileType.includes("document")) {
    return <FileText className="h-4 w-4" />;
  }
  return <FileIcon className="h-4 w-4" />;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachments({ logId, clubId, readOnly = false }: FileAttachmentsProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments = [], isLoading, refetch } = useQuery<LogAttachment[]>({
    queryKey: ["/api/logs", logId, "attachments", clubId],
    queryFn: async () => {
      const response = await fetch(`/api/logs/${logId}/attachments?clubId=${clubId}`);
      if (!response.ok) throw new Error("Failed to fetch attachments");
      return response.json();
    },
    enabled: !!logId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: number) => {
      return apiRequest("DELETE", `/api/attachments/${attachmentId}?clubId=${clubId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs", logId, "attachments", clubId] });
      toast({
        title: "Deleted",
        description: "Attachment removed.",
      });
    },
    onError: (error) => {
      console.error("Error deleting attachment:", error);
      toast({
        title: "Delete failed",
        description: "Could not delete attachment.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !logId) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("clubId", clubId);

    setUploading(true);
    try {
      const response = await fetch(`/api/logs/${logId}/attachments`, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      await refetch();
      toast({
        title: "File uploaded",
        description: "Attachment saved successfully.",
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        title: "Upload failed",
        description: "Could not upload attachment.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteClick = (attachmentId: number) => {
    if (window.confirm("Remove this attachment?")) {
      deleteMutation.mutate(attachmentId);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="h-4 w-4" />
            Photos & Attachments
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Add photos of damage, issues, etc.
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!readOnly && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={handleFileChange}
                disabled={uploading || !logId}
                className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
                data-testid="input-file-attachment"
              />
            </div>
            {!logId && (
              <p className="text-xs text-muted-foreground">
                Save the log entry first, then you can upload attachments.
              </p>
            )}
            {uploading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Upload className="h-3 w-3 animate-pulse" />
                Uploading...
              </p>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading attachments...</div>
        ) : attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No attachments yet. Add photos of broken equipment, damage, etc.
          </p>
        ) : (
          <ul className="space-y-2">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
                data-testid={`attachment-item-${attachment.id}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getFileIcon(attachment.fileType)}
                  <div className="min-w-0 flex-1">
                    <a
                      href={attachment.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium truncate block hover:underline"
                      data-testid={`attachment-link-${attachment.id}`}
                    >
                      {attachment.fileName}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.fileSize)}
                      {attachment.createdAt && (
                        <> · {new Date(attachment.createdAt).toLocaleString()}</>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    data-testid={`button-download-attachment-${attachment.id}`}
                  >
                    <a href={attachment.publicUrl} download={attachment.fileName}>
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(attachment.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-attachment-${attachment.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
