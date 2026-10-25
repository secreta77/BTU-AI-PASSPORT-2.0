import { TestBed } from '@angular/core/testing';
import { FileDrop } from './file-drop';

describe('FileDrop', () => {
  it('shows the texts and emits the chosen file', () => {
    const fixture = TestBed.createComponent(FileDrop);
    fixture.componentRef.setInput('dropText', 'Drop here');
    fixture.componentRef.setInput('chooseText', 'Choose');
    fixture.detectChanges();

    const emitted: File[] = [];
    fixture.componentInstance.fileChosen.subscribe((file) => emitted.push(file));

    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('Drop here');
    expect(host.textContent).toContain('Choose');

    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const input = host.querySelector('input') as HTMLInputElement;
    // jsdom cannot build a real FileList, so a minimal stand-in with item() is enough
    const files = { length: 1, item: () => file };
    Object.defineProperty(input, 'files', { value: files });
    input.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([file]);
  });
});
