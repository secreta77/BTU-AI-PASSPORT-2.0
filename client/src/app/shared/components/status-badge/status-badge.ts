import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { VERSION_BADGE } from '../../../core/constants';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

type BadgeVariant = (typeof VERSION_BADGE)[keyof typeof VERSION_BADGE];

// Dumb UI: shows icon + text + color for a version state (never color alone).
@Component({
  selector: 'app-status-badge',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.scss',
})
export class StatusBadge {
  readonly variant = input.required<BadgeVariant>();

  protected readonly isLatest = computed(() => this.variant() === VERSION_BADGE.LATEST);
}
