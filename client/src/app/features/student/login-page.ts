import { Component } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-login-page',
  imports: [TranslatePipe],
  template: `
    <h1>{{ 'login.title' | t }}</h1>
    <p>{{ 'login.subtitle' | t }} {{ 'common.comingSoon' | t }}</p>
  `,
})
export class LoginPage {}
