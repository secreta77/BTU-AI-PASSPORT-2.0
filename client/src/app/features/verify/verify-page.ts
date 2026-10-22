import { Component, input } from '@angular/core';

// Serves /verify and /verify/:code (the QR target)
@Component({
  selector: 'app-verify-page',
  template: `
    <h1>Verify a passport</h1>
    @if (code(); as verificationCode) {
      <p>Verification code: {{ verificationCode }}</p>
    } @else {
      <p>Enter a verification code. Coming soon.</p>
    }
  `,
})
export class VerifyPage {
  // Filled from the :code route parameter (withComponentInputBinding), undefined on /verify
  readonly code = input<string>();
}
