import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Paperclip, Trash2, FileText, Image, File as FileIcon, Download } from "lucide-react";
import { ObjectUploader } from "./ObjectUploader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LogAttachment } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface FileAttachmentsProps {
  logId: number;
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
  const [pendingFile, setPendingFile] = useState<{
    name: string;
    type: string;
    size: number;
    uploadUrl: string;
  } | null>(null);

  const { data: attachments = [], isLoading } = useQuery<LogAttachment[]>({
    queryKey: ["/api/logs", logId, "attachments", clubId],
    queryFn: async () => {
      const response = await fetch(`/api/logs/${logId}/attachments?clubId=${clubId}`);
      if (!response.ok) throw new Error("Failed to fetch attachments");
      return response.json();
    },
    enabled: !!logId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: {
      fileName: string;
      fileType: string;
      fileSize: number;
      uploadUrl: string;
    }) => {
      return apiRequest("POST", "/api/attachments", {
        clubId,
        logId,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        uploadUrl: data.uploadUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs", logId, "attachments", clubId] });
      setPendingFile(null);
      toast({
        title: "File uploaded",
        description: "Attachment saved successfully.",
      });
    },
    onError: (error) => {
      console.error("Error saving attachment:", error);
      toast({
        title: "Upload failed",
        description: "Could not save attachment.",
        variant: "destructive",
      });
    },
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

  const handleGetUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/attachments/upload-url", {
      clubId,
      logId,
      fileName: "upload",
    });
    const data = await response.json();
    return {
      method: "PUT" as const,
      url: data.url,
    };
  };

  const handleUploadComplete = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const file = result.successful[0];
      const uploadUrl = file.uploadURL;
      const fileName = file.name || "file";
      const fileType = file.type || "application/octet-stream";
      const fileSize = file.size || 0;

      saveMutation.mutate({
        fileName,
        fileType,
        fileSize,
        uploadUrl,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="h-4 w-4" />
          Attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading attachments...</div>
        ) : attachments.length === 0 ? (
          <div className="text-sm text-muted-foreground">No attachments</div>
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
                  <a
                    href={attachment.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium truncate hover:underline"
                    data-testid={`attachment-link-${attachment.id}`}
                  >
                    {attachment.fileName}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.fileSize)}
                  </span>
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
                      onClick={() => deleteMutation.mutate(attachment.id)}
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

        {!readOnly && (
          <ObjectUploader
            maxNumberOfFiles={1}
            maxFileSize={10 * 1024 * 1024}
            onGetUploadParameters={handleGetUploadParameters}
            onComplete={handleUploadComplete}
            buttonVariant="outline"
            buttonSize="sm"
            disabled={saveMutation.isPending}
          >
            <Paperclip className="h-4 w-4 mr-2" />
            Attach File
          </ObjectUploader>
        )}
      </CardContent>
    </Card>
  );
}
