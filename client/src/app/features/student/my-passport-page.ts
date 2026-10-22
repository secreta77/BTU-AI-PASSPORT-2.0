import { Component } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-my-passport-page',
  imports: [TranslatePipe],
  template: `
    <h1>{{ 'myPassport.title' | t }}</h1>
    <p>{{ 'myPassport.subtitle' | t }} {{ 'common.comingSoon' | t }}</p>
  `,
})
export class MyPassportPage {}
