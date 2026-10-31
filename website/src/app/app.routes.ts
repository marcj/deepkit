import { ActivatedRouteSnapshot, CanActivate, Routes } from '@angular/router';
import { StartpageComponent } from '@app/app/pages/startpage.component';
import { DocumentationComponent } from '@app/app/pages/documentation.component';
import { DocumentationPageComponent } from '@app/app/pages/documentation/page.component';
import { StaticPageComponent } from '@app/app/pages/static-page.component';
import { NotFoundComponent } from '@app/app/pages/not-found.component';
import { Injectable } from '@angular/core';
import { BlogComponent, BlogListComponent, BlogPostDetailComponent } from '@app/app/pages/blog.component';
import { BookComponent } from '@app/app/pages/documentation/book.component.js';
import { BenchmarksComponent } from '@app/app/pages/benchmarks.component.js';

@Injectable({ providedIn: 'root' })
export class NotFoundGuard implements CanActivate {
    canActivate(route: ActivatedRouteSnapshot): boolean {
        return !('try' in route.queryParams);
    }
}

export const routes: Routes = [
    { path: 'benchmarks', component: BenchmarksComponent },

    { path: '', pathMatch: 'full', component: StartpageComponent },
    { path: 'zh', pathMatch: 'full', component: StartpageComponent },
    { path: 'ko', pathMatch: 'full', component: StartpageComponent },
    { path: 'ja', pathMatch: 'full', component: StartpageComponent },
    { path: 'de', pathMatch: 'full', component: StartpageComponent },

    { path: 'admin', loadComponent: () => import('./pages/admin/admin.component').then(v => v.AdminComponent) },
    // { path: 'library', component: LibrariesComponent },
    // { path: 'library/:id', component: LibraryComponent },
    // { path: 'enterprise', component: EnterpriseComponent },
    // { path: 'community', component: CommunityComponent },
    { path: 'terms', component: StaticPageComponent, data: { page: 'terms' } },
    { path: 'about-us', component: StaticPageComponent, data: { page: 'about-us' } },
    { path: 'contact', component: StaticPageComponent, data: { page: 'contact' } },
    { path: 'data-protection', component: StaticPageComponent, data: { page: 'data-protection' } },
    { path: ':lang/documentation/book', component: BookComponent },
    {
        path: ':lang/blog', component: BlogComponent, children: [
            { path: '', pathMatch: 'full', component: BlogListComponent },
            { path: ':slug', component: BlogPostDetailComponent },
        ],
    },
    {
        path: ':lang/documentation',
        component: DocumentationComponent,
        data: { search: true, footer: false, hideLogo: true },
        children: [
            // {
            //     path: 'questions', component: EmptyComponent, children: [
            //         { path: 'post/:slug', component: CommunityQuestionComponent },
            //         { path: '**', component: CommunityQuestionsComponent },
            //     ],
            // },
            // { path: 'search', component: DocuSearchComponent },
            // { path: 'examples', component: ExamplesComponent },
            { path: 'desktop-ui', loadChildren: () => import('./pages/documentation/desktop-ui/desktop-ui.module').then(v => v.DocDesktopUIModule) },
            // { path: ':category/examples/:slug', component: ExampleComponent },
            // { path: ':category/examples', component: ExamplesComponent },
            { path: '**', component: DocumentationPageComponent },
        ],
    },

    // 404
    { path: '**', component: NotFoundComponent, canActivate: [NotFoundGuard] },
];
