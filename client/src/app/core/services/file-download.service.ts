import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

// Saves a blob as a file. A temporary link is the standard way to name the downloaded file.
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  private readonly document = inject(DOCUMENT);

  save(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
}
