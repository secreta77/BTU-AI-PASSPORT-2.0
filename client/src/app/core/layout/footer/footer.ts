import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-footer',
  imports: [TranslatePipe],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {}
