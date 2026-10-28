import { toSkillListItem } from './skill-list-item';

const SKILL = {
  skillName: 'Prompt Engineering',
  skillCategory: 'AI Skill',
  stampCode: 'BDG-AI-001',
  dateEarned: '2026-09-12',
};

describe('toSkillListItem', () => {
  it('translates a known category and points to the stamp file', () => {
    const item = toSkillListItem('SKL-001', SKILL, (key) => `t:${key}`);

    expect(item.categoryLabel).toBe('t:skillCategory.skill');
    expect(item.categoryLang).toBeUndefined();
    expect(item.stampUrl).toBe('/assets/stamps/BDG-AI-001.png');
    expect(item.stampWidth).toBe(328);
  });

  it('shows an unknown category as raw English text and uses the default stamp size', () => {
    const item = toSkillListItem(
      'X',
      { ...SKILL, skillCategory: 'New', stampCode: 'BDG-X' },
      (key) => key,
    );

    expect(item.categoryLabel).toBe('New');
    expect(item.categoryLang).toBe('en');
    expect(item.stampWidth).toBe(304);
  });
});
