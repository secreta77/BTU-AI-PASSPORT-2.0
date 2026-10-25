import { TestBed } from '@angular/core/testing';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('shows the label it gets from the page', () => {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('variant', 'outdated');
    fixture.componentRef.setInput('label', 'Outdated');
    fixture.detectChanges();

    const badge: HTMLElement = fixture.nativeElement.querySelector('.badge');
    expect(badge.textContent).toContain('Outdated');
    expect(badge.classList).toContain('badge--outdated');
  });
});
