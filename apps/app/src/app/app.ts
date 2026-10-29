import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ProductFeedback } from './feedback/feedback.component';

@Component({
    selector: 'app-root',
    imports: [RouterModule, ProductFeedback],
    template: `<router-outlet></router-outlet><app-product-feedback />`
})
export class App {}
