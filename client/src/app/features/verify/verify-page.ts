import { DatePipe, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { createSlowFlag } from '../../core/utils/slow-loading';
import { FileDrop, Skeleton, SkillList, StatusBadge } from '@btu/ui';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TX_EXPLORER_URL, VERIFY_RESULT, VERSION_BADGE } from '../../core/constants';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ChainCheck, VerifyInfo, VerifyResult } from '../../core/models/verify.model';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ChainVerifyService } from '../../core/services/chain-verify.service';
import { HashService } from '../../core/services/hash.service';
import { MOCK_DOC_HASHES } from '../../core/services/mock-verify.data';
import { toSkillListItem } from '../../core/utils/skill-list-item';

const NOT_FOUND_HTTP_STATUS = 404;

type PageState = 'idle' | 'loading' | 'found' | 'notFound' | 'error';
type ChainState = 'idle' | 'checking' | 'done' | 'failed';
type FileState = 'idle' | 'hashing' | 'done' | 'notPdf';

interface LoadResult {
  state: PageState;
  info: VerifyInfo | null;
}

// Serves /verify and /verify/:code (the QR target). Typing a code only navigates,
// so QR and manual entry follow the same path.
@Component({
  selector: 'app-verify-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    NgOptimizedImage,
    TranslatePipe,
    StatusBadge,
    FileDrop,
    Skeleton,
    SkillList,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-page.html',
  styleUrl: './verify-page.scss',
})
export class VerifyPage {
  private readonly languageService = inject(LanguageService);
  protected readonly language = this.languageService.language;

  protected readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly chainVerify = inject(ChainVerifyService);
  private readonly hashService = inject(HashService);
  private readonly injector = inject(Injector);

  // Filled from the :code route parameter (withComponentInputBinding), undefined on /verify
  readonly code = input<string>();

  protected readonly codeControl = new FormControl('', { nonNullable: true });
  protected readonly state = signal<PageState>('idle');
  protected readonly info = signal<VerifyInfo | null>(null);
  protected readonly isLoading = computed(() => this.state() === 'loading');
  protected readonly isSlow = createSlowFlag(this.isLoading);

  // Blockchain check is skipped in mock mode (mock codes are not on the chain)
  protected readonly showChain = !environment.useMockApi;
  protected readonly chainState = signal<ChainState>('idle');
  protected readonly chain = signal<ChainCheck | null>(null);

  protected readonly fileState = signal<FileState>('idle');
  protected readonly fileResult = signal<VerifyResult | null>(null);
  protected readonly VERIFY_RESULT = VERIFY_RESULT;

  // The result heading (found / not found / error): focused when an answer arrives
  private readonly resultTitle = viewChild<ElementRef<HTMLElement>>('resultTitle');

  // Changes on every "try again" click so the same code is requested once more
  private readonly attempt = signal(0);

  protected readonly badgeVariant = computed(() => {
    const info = this.info();
    return info && info.version === info.latestVersion
      ? VERSION_BADGE.LATEST
      : VERSION_BADGE.OUTDATED;
  });

  // The server may not send skills yet: then the list is empty and the section is hidden
  protected readonly skillItems = computed(() =>
    (this.info()?.skills ?? []).map((skill) =>
      toSkillListItem(skill.skillName, skill, (key) => this.languageService.translate(key)),
    ),
  );

  protected readonly isLatest = computed(() => this.badgeVariant() === VERSION_BADGE.LATEST);

  // The hash a file is compared with: the one on the chain (mock mode: the mock hash, never the database)
  private readonly expectedDocHash = computed(() => {
    const info = this.info();
    if (!info) {
      return null;
    }
    if (!this.showChain) {
      return MOCK_DOC_HASHES[info.verificationCode] ?? null;
    }
    const chain = this.chain();
    return chain?.recordExists ? chain.docHash : null;
  });

  protected readonly canCheckFile = computed(() => this.expectedDocHash() !== null);

  // On the chain the latest version is read from the contract, in mock mode from the mock answer
  protected readonly fileComparedLatestVersion = computed(() => {
    const chain = this.chain();
    if (chain?.recordExists) {
      return chain.latestVersion;
    }
    return this.info()?.latestVersion ?? 0;
  });

  protected readonly txUrl = computed(() => {
    const info = this.info();
    if (!info) {
      return '';
    }
    return TX_EXPLORER_URL + info.txHash;
  });

  constructor() {
    const request = computed(() => ({ code: this.code(), attempt: this.attempt() }));

    // switchMap drops an older answer when the code changes while it is still loading
    toObservable(request)
      .pipe(
        tap(({ code }) => this.prepareRequest(code)),
        switchMap(({ code }) => this.loadInfo(code)),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.state.set(result.state);
        this.info.set(result.info);
        this.focusResultTitle(result.state);
        if (result.info && this.showChain) {
          void this.runChainCheck(result.info);
        }
      });
  }

  protected submit(event: Event): void {
    // Without this the browser would reload the page (native form submit)
    event.preventDefault();
    const code = this.codeControl.value.trim().toUpperCase();
    if (!code) {
      return;
    }
    this.router.navigate(['/verify', code]);
  }

  protected retry(): void {
    this.attempt.update((value) => value + 1);
  }

  protected retryChain(): void {
    const info = this.info();
    if (info) {
      void this.runChainCheck(info);
    }
  }

  protected async checkFile(file: File): Promise<void> {
    this.fileResult.set(null);
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.fileState.set('notPdf');
      return;
    }
    this.fileState.set('hashing');
    // The file stays in the browser: only its hash is computed here
    const fileHash = await this.hashService.sha256Hex(await file.arrayBuffer());
    this.fileResult.set(this.compareWithChain(fileHash));
    this.fileState.set('done');
  }

  protected resetFile(): void {
    this.fileState.set('idle');
    this.fileResult.set(null);
  }

  private compareWithChain(fileHash: string): VerifyResult {
    if (fileHash !== this.expectedDocHash()) {
      return VERIFY_RESULT.MODIFIED;
    }
    const info = this.info();
    const isLatest = !!info && info.version === this.fileComparedLatestVersion();
    return isLatest ? VERIFY_RESULT.AUTHENTIC_LATEST : VERIFY_RESULT.AUTHENTIC_OUTDATED;
  }

  private async runChainCheck(info: VerifyInfo): Promise<void> {
    this.chainState.set('checking');
    this.chain.set(null);
    try {
      const chain = await this.chainVerify.check(info);
      // The user may have entered another code while we were reading
      if (this.info() !== info) {
        return;
      }
      this.chain.set(chain);
      this.chainState.set('done');
    } catch {
      if (this.info() === info) {
        this.chainState.set('failed');
      }
    }
  }

  // Moves keyboard and screen reader focus to the answer; tabindex=-1 in the template makes the heading focusable
  private focusResultTitle(state: PageState): void {
    if (state === 'idle') {
      return;
    }
    afterNextRender(() => this.resultTitle()?.nativeElement.focus(), { injector: this.injector });
  }

  private prepareRequest(code: string | undefined): void {
    if (!code) {
      return;
    }
    // A QR link opens the page with a code: show it in the input as well
    this.codeControl.setValue(code);
    this.state.set('loading');
    this.info.set(null);
    this.chain.set(null);
    this.chainState.set('idle');
    this.resetFile();
  }

  private loadInfo(code: string | undefined) {
    if (!code) {
      return of<LoadResult>({ state: 'idle', info: null });
    }
    return this.api.getVerifyInfo(code).pipe(
      map((info): LoadResult => ({ state: 'found', info })),
      catchError((error) => {
        const state = error?.status === NOT_FOUND_HTTP_STATUS ? 'notFound' : 'error';
        return of<LoadResult>({ state, info: null });
      }),
    );
  }
}
