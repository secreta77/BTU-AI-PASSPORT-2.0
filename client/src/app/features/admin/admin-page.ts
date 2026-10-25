import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-page',
  imports: [TranslatePipe],
  template: `
    <h1>{{ 'admin.title' | t }}</h1>
    <p>{{ 'admin.subtitle' | t }} {{ 'common.comingSoon' | t }}</p>
  `,
})
export class AdminPage {}
