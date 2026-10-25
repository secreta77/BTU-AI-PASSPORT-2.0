import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AdminSyncService } from '../../core/services/admin-sync.service';

// "Start sync" button and the status of the run. Polling lives in AdminSyncService.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-sync-panel',
  imports: [TranslatePipe],
  templateUrl: './admin-sync-panel.html',
  styleUrl: './admin-sync-panel.scss',
})
export class AdminSyncPanel {
  protected readonly language = inject(LanguageService).language;
  protected readonly sync = inject(AdminSyncService);

  protected readonly busy = computed(
    () => this.sync.state() === 'starting' || this.sync.state() === 'running',
  );

  protected readonly summary = computed(() => this.sync.status()?.summary ?? null);

  constructor() {
    this.sync.resume();
  }
}
