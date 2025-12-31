import { Routes } from '@angular/router';
import { CatalogComponent } from './pages/catalog/catalog';
import { ExportComponent } from './pages/export/export';
import { SelectionComponent } from './pages/selection/selection';


export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'catalog' },
  { path: 'catalog', component: CatalogComponent },
  { path: 'selection', component: SelectionComponent },
  { path: 'export', component: ExportComponent },
  { path: '**', redirectTo: 'catalog' },
];
