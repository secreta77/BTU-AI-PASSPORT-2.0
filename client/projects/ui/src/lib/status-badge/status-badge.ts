import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type StatusBadgeVariant = 'latest' | 'outdated';

// Dumb UI: shows icon + text + color for a state (never color alone). The text comes from the page.
@Component({
  selector: 'ui-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.scss',
})
export class StatusBadge {
  readonly variant = input.required<StatusBadgeVariant>();
  readonly label = input.required<string>();

  protected readonly isLatest = computed(() => this.variant() === 'latest');
}
