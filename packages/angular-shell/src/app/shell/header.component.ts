import { Component } from '@angular/core';

@Component({
    selector: 'app-header',
    standalone: true,
    template: `
    <header class="shell-header">
      <strong>Market</strong>
      <nav><a href="/checkout">Оформление</a></nav>
    </header>
  `,
    styles: [`
    .shell-header { display: flex; justify-content: space-between; align-items: center;
                    padding: 12px 24px; background: #111; color: #fff; }
    .shell-header a { color: #fff; }
  `],
})
export class HeaderComponent {}