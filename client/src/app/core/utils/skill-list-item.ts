import type { SkillListItem } from '@btu/ui';
import {
  DEFAULT_STAMP_IMAGE_SIZE,
  SKILL_CATEGORY_KEY,
  STAMP_IMAGE_EXTENSION,
  STAMP_IMAGE_SIZE,
  STAMP_IMAGE_URL,
} from '../constants';
import type { TranslationKey } from '../i18n/ka';

// The fields every skill list needs: the passport page and the verify page both have them
export interface SkillSource {
  skillName: string;
  skillCategory: string;
  stampCode: string;
  dateEarned: string;
  skillDescription?: string | null;
}

// Turns a skill from the API into a row of <ui-skill-list>. This is the one place that knows
// the stamp files and the category texts. `translate` is passed in so the caller stays reactive.
export function toSkillListItem(
  id: string,
  skill: SkillSource,
  translate: (key: TranslationKey) => string,
): SkillListItem {
  const categoryKey = SKILL_CATEGORY_KEY[skill.skillCategory];
  const size = STAMP_IMAGE_SIZE[skill.stampCode] ?? DEFAULT_STAMP_IMAGE_SIZE;

  return {
    id,
    name: skill.skillName,
    // Unknown category: show the raw text from the data instead of nothing
    categoryLabel: categoryKey ? translate(categoryKey) : skill.skillCategory,
    categoryLang: categoryKey ? undefined : 'en',
    dateEarned: skill.dateEarned,
    stampUrl: `${STAMP_IMAGE_URL}${skill.stampCode}${STAMP_IMAGE_EXTENSION}`,
    stampWidth: size.width,
    stampHeight: size.height,
    description: skill.skillDescription,
  };
}
