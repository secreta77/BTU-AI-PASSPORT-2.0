import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SkeletonVariant = 'line' | 'line-short' | 'title' | 'block' | 'square';

// Dumb UI: a gray placeholder shape with a shimmer. Purely visual, so it is hidden from screen readers;
// the page announces "loading" separately with a .sr-only text inside an aria-live region.
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styleUrl: './skeleton.scss',
  host: {
    'aria-hidden': 'true',
    '[class]': '"skeleton skeleton--" + variant()',
  },
})
export class Skeleton {
  readonly variant = input<SkeletonVariant>('line');
}
