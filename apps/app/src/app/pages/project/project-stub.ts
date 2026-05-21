import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-project-stub',
  standalone: true,
  template: `
    <div class="card">
      <div class="font-semibold text-xl mb-4">{{ title }}</div>
      <p class="text-muted-color">This section is under development.</p>
    </div>
  `,
})
export class ProjectStub {
  title: string;

  constructor() {
    const route = inject(ActivatedRoute);
    this.title = route.snapshot.data['title'] ?? 'Coming Soon';
  }
}
