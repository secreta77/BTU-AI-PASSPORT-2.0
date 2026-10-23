import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

// Dumb UI: drag & drop zone plus a "choose file" button. Only reports the chosen file.
@Component({
  selector: 'app-file-drop',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './file-drop.html',
  styleUrl: './file-drop.scss',
})
export class FileDrop {
  readonly fileChosen = output<File>();

  protected readonly isDragging = signal(false);

  protected onDragOver(event: DragEvent): void {
    // Without preventDefault the browser would not allow a drop here
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected onDragLeave(): void {
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    this.emitFirstFile(event.dataTransfer?.files);
  }

  protected onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emitFirstFile(input.files);
    // Reset so choosing the same file again still fires a change event
    input.value = '';
  }

  private emitFirstFile(files: FileList | null | undefined): void {
    const file = files?.item(0);
    if (file) {
      this.fileChosen.emit(file);
    }
  }
}
