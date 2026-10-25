import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminSyncService } from '../../core/services/admin-sync.service';
import { AdminAwardForm } from './admin-award-form';
import { AdminLogin } from './admin-login';
import { AdminPassports } from './admin-passports';
import { AdminSyncLog } from './admin-sync-log';
import { AdminSyncPanel } from './admin-sync-panel';

// Shell of /admin: the key form until a key is entered, then the dashboard.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-page',
  imports: [TranslatePipe, AdminLogin, AdminAwardForm, AdminPassports, AdminSyncLog, AdminSyncPanel],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.scss',
})
export class AdminPage implements OnDestroy {
  protected readonly language = inject(LanguageService).language;
  protected readonly adminAuth = inject(AdminAuthService);
  private readonly sync = inject(AdminSyncService);

  // Leaving the page stops the status polling (the sync itself keeps running on the server)
  ngOnDestroy(): void {
    this.sync.stopPolling();
  }

  protected logout(): void {
    this.sync.stopPolling();
    this.adminAuth.logout();
  }
}
