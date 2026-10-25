import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Subject, catchError, exhaustMap, map, of } from 'rxjs';
import {
  API_ERROR_CODE,
  EARNED_THROUGH_MAX_LENGTH,
  SKILL_CATEGORY_KEY,
  STUDENT_ID_PATTERN,
} from '../../core/constants';
import { LanguageService } from '../../core/i18n/language.service';
import type { TranslationKey } from '../../core/i18n/ka';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AdminSkill, CreateAwardRequest, CreateAwardResponse } from '../../core/models/admin.model';
import { getApiErrorCode } from '../../core/models/api-error.model';
import { AdminSyncService } from '../../core/services/admin-sync.service';
import { ApiService } from '../../core/services/api.service';
import { Skeleton } from '@btu/ui';

type SkillsState = { status: 'loading' | 'error' } | { status: 'ready'; skills: AdminSkill[] };
type SubmitResult = { ok: true; response: CreateAwardResponse } | { ok: false; code: string | null };

// Today as YYYY-MM-DD in the admin's own time zone (what the date input uses)
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// ISO dates compare correctly as plain strings
function notFutureDate(control: AbstractControl<string>): ValidationErrors | null {
  return control.value > todayIso() ? { future: true } : null;
}

// "Add a skill by hand" form. After a save the server starts a sync; AdminSyncService follows it.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-award-form',
  imports: [ReactiveFormsModule, TranslatePipe, Skeleton],
  templateUrl: './admin-award-form.html',
  styleUrl: './admin-award-form.scss',
})
export class AdminAwardForm {
  protected readonly language = inject(LanguageService).language;
  private readonly api = inject(ApiService);
  private readonly sync = inject(AdminSyncService);

  protected readonly maxDate = todayIso();
  protected readonly maxLength = EARNED_THROUGH_MAX_LENGTH;

  protected readonly form = new FormGroup({
    studentId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(STUDENT_ID_PATTERN)],
    }),
    skillId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    dateEarned: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notFutureDate],
    }),
    earnedThrough: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(EARNED_THROUGH_MAX_LENGTH)],
    }),
  });

  protected readonly skillsState = toSignal(
    this.api.getAdminSkills().pipe(
      map((skills): SkillsState => ({ status: 'ready', skills })),
      catchError(() => of<SkillsState>({ status: 'error' })),
    ),
    { initialValue: { status: 'loading' } as SkillsState },
  );

  protected readonly skills = computed(() => {
    const state = this.skillsState();
    return state.status === 'ready' ? state.skills : [];
  });

  protected readonly pending = signal(false);
  // Message under the form: success or an error that belongs to no single field
  protected readonly successKey = signal<TranslationKey | null>(null);
  protected readonly failureKey = signal<TranslationKey | null>(null);

  private readonly submits = new Subject<CreateAwardRequest>();

  constructor() {
    // exhaustMap: while one request is running, other submits are ignored
    this.submits
      .pipe(
        exhaustMap((body) =>
          this.api.createAdminAward(body).pipe(
            map((response): SubmitResult => ({ ok: true, response })),
            catchError((error) => of<SubmitResult>({ ok: false, code: getApiErrorCode(error) })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => this.handleResult(result));
  }

  protected categoryKey(category: string): TranslationKey | null {
    return SKILL_CATEGORY_KEY[category] ?? null;
  }

  // The first error of a control that the admin has already touched, as a translation key
  protected errorKey(name: keyof typeof this.form.controls): TranslationKey | null {
    const control = this.form.controls[name];
    const errors = control.errors;
    if (!errors || !control.touched) {
      return null;
    }
    if (errors['required']) {
      return 'admin.awards.error.required';
    }
    if (errors['pattern']) {
      return 'admin.awards.error.studentIdFormat';
    }
    if (errors['future']) {
      return 'admin.awards.error.dateFuture';
    }
    if (errors['maxlength']) {
      return 'admin.awards.error.tooLong';
    }
    if (errors['studentNotFound']) {
      return 'admin.awards.error.studentNotFound';
    }
    if (errors['skillNotFound']) {
      return 'admin.awards.error.skillNotFound';
    }
    return null;
  }

  protected submit(event: Event): void {
    event.preventDefault(); // no page reload
    if (this.pending()) {
      return;
    }
    this.successKey.set(null);
    this.failureKey.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.pending.set(true);
    this.submits.next({
      studentId: value.studentId.trim(),
      skillId: value.skillId,
      dateEarned: value.dateEarned,
      earnedThrough: value.earnedThrough.trim() || null,
    });
  }

  private handleResult(result: SubmitResult): void {
    this.pending.set(false);
    if (!result.ok) {
      this.showError(result.code);
      return;
    }
    this.form.reset();
    this.successKey.set(
      result.response.syncStarted ? 'admin.awards.success' : 'admin.awards.successWaiting',
    );
    if (result.response.syncStarted) {
      this.sync.watchStartedRun(); // the sync panel shows it; list and log reload when it ends
    }
  }

  private showError(code: string | null): void {
    if (code === API_ERROR_CODE.STUDENT_NOT_FOUND) {
      this.form.controls.studentId.setErrors({ studentNotFound: true });
      this.form.controls.studentId.markAsTouched();
    } else if (code === API_ERROR_CODE.SKILL_NOT_FOUND) {
      this.form.controls.skillId.setErrors({ skillNotFound: true });
      this.form.controls.skillId.markAsTouched();
    } else if (code === API_ERROR_CODE.AWARD_ALREADY_EXISTS) {
      this.failureKey.set('admin.awards.error.duplicate');
    } else if (code === API_ERROR_CODE.INVALID_REQUEST) {
      this.failureKey.set('admin.awards.error.invalid');
    } else {
      this.failureKey.set('admin.awards.error.failed');
    }
  }
}
