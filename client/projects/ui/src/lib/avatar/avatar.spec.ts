import { TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';

describe('Avatar', () => {
  function render(inputs: Record<string, unknown>): HTMLElement {
    const fixture = TestBed.createComponent(Avatar);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.avatar');
  }

  it('shows uppercase initials of first and last name', () => {
    const avatar = render({ name: 'nino beridze' });
    expect(avatar.textContent?.trim()).toBe('NB');
    expect(avatar.getAttribute('aria-label')).toBe('nino beridze');
  });

  it('shows one letter for a single word name', () => {
    expect(render({ name: 'Nino' }).textContent?.trim()).toBe('N');
  });

  it('shows an icon when there is no name', () => {
    const avatar = render({ icon: 'admin', label: 'Administration' });
    expect(avatar.querySelector('svg')).not.toBeNull();
    expect(avatar.getAttribute('aria-label')).toBe('Administration');
  });
});
