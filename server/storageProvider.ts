import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

export interface StoredFile {
  key: string;
  url: string;
}

export interface PresignedUploadInfo {
  method: "PUT";
  url: string;
}

export interface StorageProvider {
  getPresignedUploadUrl(opts: {
    clubId: string;
    logId: number;
    fileName: string;
  }): Promise<PresignedUploadInfo>;

  deleteObject(key: string): Promise<void>;

  normalizeObjectPath(uploadUrl: string): string;
}

export class ReplitObjectStorageProvider implements StorageProvider {
  private objectStorageService: ObjectStorageService;

  constructor() {
    this.objectStorageService = new ObjectStorageService();
  }

  async getPresignedUploadUrl(_opts: {
    clubId: string;
    logId: number;
    fileName: string;
  }): Promise<PresignedUploadInfo> {
    const uploadURL = await this.objectStorageService.getObjectEntityUploadURL();
    return {
      method: "PUT",
      url: uploadURL,
    };
  }

  async deleteObject(_key: string): Promise<void> {
    // Object deletion handled via object storage service
    // For now, we just mark as deleted in DB - actual deletion can be implemented later
  }

  normalizeObjectPath(uploadUrl: string): string {
    return this.objectStorageService.normalizeObjectEntityPath(uploadUrl);
  }
}

export const storageProvider: StorageProvider = new ReplitObjectStorageProvider();
