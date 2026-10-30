import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, ViewChild } from '@angular/core';

@Component({
    selector: 'app-screen',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.Eager,
    template: ``,
})
export class ScreenComponent {
    @Input() src!: string;
    @Input() title: string = '';
    @Input() width: string = '';

    constructor(screens: ScreensComponent) {
        screens.addScreen(this);
    }
}

@Component({
    selector: 'app-screens',
    template: `
        @if (screens.length === 1) {
            <div class="wrapper single" style="text-align: center">
                <a [href]="screens[0].src" target="_blank"
                    ><img [style.max-width.px]="screens[0].width" alt="screen" [src]="screens[0].src"
                /></a>
            </div>
        }

        @if (screens.length > 1) {
            <div class="container">
                <div class="scroll" #scroll>
                    @for (s of screens; track s) {
                        <div class="screen" [style.flexBasis.px]="itemWidth">
                            <a [href]="s.src" target="_blank"><img alt="screen" [src]="s.src" /></a>
                        </div>
                    }
                </div>
            </div>
            <div class="arrow-left" (click)="go(-1)">❮</div>
            <div class="arrow-right" (click)="go(1)">❯</div>
        }
    `,
    imports: [],
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./screens.component.css'],
})
export class ScreensComponent {
    @Input() itemWidth: number = 350;

    screens: ScreenComponent[] = [];

    protected fullItemWidth = this.itemWidth + 30;

    @ViewChild('scroll') scroll!: ElementRef<HTMLDivElement>;

    constructor(protected cd: ChangeDetectorRef) {}

    addScreen(screen: ScreenComponent): void {
        this.screens.push(screen);
        this.cd.detectChanges();
    }

    go(d: number): void {
        const items = this.screens.length;

        const scrollLeft = parseInt(this.scroll.nativeElement.style.left || '0', 10) * -1;
        let item = Math.ceil(scrollLeft / this.fullItemWidth);
        item += d;
        if (item < 0) item = 0;
        if (item >= items - 1) item = items - 1;
        this.scroll.nativeElement.style.left = this.fullItemWidth * item * -1 + 'px';
    }
}
