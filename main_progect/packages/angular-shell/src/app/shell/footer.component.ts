import { Component } from '@angular/core';

@Component({
    selector: 'app-footer',
    standalone: true,
    template: `<footer class="shell-footer">© Market, 2026</footer>`,
    styles: [`.shell-footer { padding: 16px 24px; border-top: 1px solid #eee; color: #666; }`],
})
export class FooterComponent {}