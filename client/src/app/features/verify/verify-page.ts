import { Component, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

// Serves /verify and /verify/:code (the QR target)
@Component({
  selector: 'app-verify-page',
  imports: [TranslatePipe],
  template: `
    <h1>{{ 'verify.title' | t }}</h1>
    @if (code(); as verificationCode) {
      <p>{{ 'verify.codeLabel' | t }}: {{ verificationCode }}</p>
    } @else {
      <p>{{ 'verify.enterCode' | t }} {{ 'common.comingSoon' | t }}</p>
    }
  `,
})
export class VerifyPage {
  // Filled from the :code route parameter (withComponentInputBinding), undefined on /verify
  readonly code = input<string>();
}
