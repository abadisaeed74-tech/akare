import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import AuthPage from './components/AuthPage';
import LandingPage from './components/LandingPage';
import PublicPropertyPage from './components/PublicPropertyPage';
import SettingsPage from './components/SettingsPage';
import CompanyPublicPropertiesPage from './components/CompanyPublicPropertiesPage';
import StripeCheckoutPage from './components/StripeCheckoutPage';
import PlatformAdminPage from './components/PlatformAdminPage';
import './style.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/app" element={<App />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/platform-admin" element={<PlatformAdminPage />} />
        <Route path="/billing/checkout" element={<StripeCheckoutPage />} />
        <Route path="/share/:id" element={<PublicPropertyPage />} />
        <Route path="/share/company/:ownerId" element={<CompanyPublicPropertiesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
