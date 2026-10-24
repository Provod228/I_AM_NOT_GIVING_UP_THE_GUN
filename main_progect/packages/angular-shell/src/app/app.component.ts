import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './shell/header.component';
import { FooterComponent } from './shell/footer.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, HeaderComponent, FooterComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <app-header />
    <main class="shell-main"><router-outlet /></main>
    <app-footer />
  `,
})
export class AppComponent {}