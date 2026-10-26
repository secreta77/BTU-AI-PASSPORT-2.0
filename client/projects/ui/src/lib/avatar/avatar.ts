import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AvatarIcon = 'user' | 'admin';

// Dumb UI: a circle with initials of `name`, or an icon when there is no name.
// `label` is the accessible name (the page passes the full name or a translated text).
@Component({
  selector: 'ui-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
})
export class Avatar {
  readonly name = input<string | null>(null);
  readonly icon = input<AvatarIcon>('user');
  readonly label = input<string | null>(null);

  // First letter of the first and of the last word, uppercase
  protected readonly initials = computed(() => {
    const words = (this.name() ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return '';
    }
    const first = words[0];
    const last = words.length > 1 ? words[words.length - 1] : '';
    return (first.charAt(0) + last.charAt(0)).toUpperCase();
  });

  protected readonly accessibleName = computed(() => this.label() ?? this.name());
}
