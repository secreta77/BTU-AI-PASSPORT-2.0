import { TestBed } from '@angular/core/testing';
import { SkillList, SkillListItem } from './skill-list';

const ITEM: SkillListItem = {
  id: 'SKL-001',
  name: 'Prompt Engineering',
  categoryLabel: 'AI Skill',
  categoryLang: 'en',
  dateEarned: '2026-09-12',
  stampUrl: '/assets/stamps/BDG-AI-001.png',
  stampWidth: 328,
  stampHeight: 284,
};

function render(items: SkillListItem[]): HTMLElement {
  const fixture = TestBed.createComponent(SkillList);
  fixture.componentRef.setInput('items', items);
  fixture.componentRef.setInput('earnedLabel', 'Earned');
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('SkillList', () => {
  it('shows name, category and the date without moving it by a day', () => {
    const element = render([ITEM]);

    expect(element.querySelector('.skill__name')?.textContent).toContain('Prompt Engineering');
    expect(element.querySelector('.skill__meta')?.textContent).toContain('Earned');
    expect(element.querySelector('.skill__meta')?.textContent).toContain('12.09.2026');
  });

  it('shows the description only when there is one', () => {
    expect(render([ITEM]).querySelector('.skill__text')).toBeNull();
    expect(
      render([{ ...ITEM, description: 'Writes clear prompts.' }]).querySelector('.skill__text'),
    ).not.toBeNull();
  });
});
