import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  API_ERROR_CODE,
  STAMP_IMAGE_EXTENSION,
  STAMP_IMAGE_URL,
} from '../../core/constants';
import type { TranslationKey } from '../../core/i18n/ka';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { getApiErrorCode } from '../../core/models/api-error.model';
import { Passport } from '../../core/models/passport.model';
import { ApiService } from '../../core/services/api.service';
import { FileDownloadService } from '../../core/services/file-download.service';

type PageState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-my-passport-page',
  imports: [DatePipe, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-passport-page.html',
  styleUrl: './my-passport-page.scss',
})
export class MyPassportPage {
  private readonly api = inject(ApiService);
  private readonly fileDownload = inject(FileDownloadService);

  protected readonly state = signal<PageState>('loading');
  protected readonly passport = signal<Passport | null>(null);
  protected readonly loadErrorKey = signal<TranslationKey>('myPassport.error.generic');
  protected readonly downloading = signal(false);
  protected readonly downloadFailed = signal(false);

  constructor() {
    this.loadPassport();
  }

  protected stampUrl(stampCode: string): string {
    return `${STAMP_IMAGE_URL}${stampCode}${STAMP_IMAGE_EXTENSION}`;
  }

  protected downloadPdf(passport: Passport): void {
    this.downloading.set(true);
    this.downloadFailed.set(false);

    const fallbackName = `${passport.passportId}-v${passport.latest.version}.pdf`;
    this.api.downloadMyPassportPdf(fallbackName).subscribe({
      next: (file) => {
        this.fileDownload.save(file.blob, file.fileName);
        this.downloading.set(false);
      },
      error: () => {
        this.downloading.set(false);
        this.downloadFailed.set(true);
      },
    });
  }

  private loadPassport(): void {
    this.api.getMyPassport().subscribe({
      next: (passport) => {
        this.passport.set(passport);
        this.state.set('ready');
      },
      error: (error) => {
        const notIssued = getApiErrorCode(error) === API_ERROR_CODE.PASSPORT_NOT_FOUND;
        this.loadErrorKey.set(
          notIssued ? 'myPassport.error.PASSPORT_NOT_FOUND' : 'myPassport.error.generic',
        );
        this.state.set('error');
      },
    });
  }
}
