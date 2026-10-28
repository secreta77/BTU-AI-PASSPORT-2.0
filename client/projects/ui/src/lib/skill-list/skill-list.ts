import { DatePipe, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Skeleton } from '../skeleton/skeleton';

// One row of the list. The page builds it, so the library knows nothing about stamps, i18n or the API.
export interface SkillListItem {
  id: string;
  name: string; // English data from BTU
  categoryLabel: string;
  categoryLang?: string; // 'en' when the label is raw data and not a translation
  dateEarned: string; // date only: YYYY-MM-DD
  stampUrl: string;
  stampWidth: number; // real pixel size of the file (NgOptimizedImage needs it)
  stampHeight: number;
  description?: string | null;
}

// Placeholder rows shown while the page loads
const SKELETON_ROWS = [1, 2, 3];

// Dumb UI: a list of skills with their stamps. All texts come from the page.
@Component({
  selector: 'ui-skill-list',
  imports: [DatePipe, NgOptimizedImage, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skill-list.html',
  styleUrl: './skill-list.scss',
})
export class SkillList {
  readonly items = input<SkillListItem[]>([]);
  readonly earnedLabel = input.required<string>(); // e.g. "Earned"
  readonly loading = input(false);

  protected readonly skeletonRows = SKELETON_ROWS;
}
