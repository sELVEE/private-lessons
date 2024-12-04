import { Routes } from '@angular/router';
import {DashboardComponent} from './pages/dashboard/dashboard.component';
import {NotFoundComponent} from './pages/not-found/not-found.component';

export const routes: Routes = [
  {
    path: '', component: DashboardComponent
  },
  {
    path: 'not-found', component: NotFoundComponent
  },
  {
    path: '**', redirectTo: 'not-found', pathMatch: 'full'
  }
];
