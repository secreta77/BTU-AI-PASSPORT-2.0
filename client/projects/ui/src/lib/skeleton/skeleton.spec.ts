import { TestBed } from '@angular/core/testing';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('sets the variant class and hides itself from screen readers', () => {
    const fixture = TestBed.createComponent(Skeleton);
    fixture.componentRef.setInput('variant', 'title');
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList).toContain('skeleton--title');
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });
});
