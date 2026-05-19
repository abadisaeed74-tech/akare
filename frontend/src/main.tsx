import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import AuthPage from './components/AuthPage';
import LandingPage from './components/LandingPage';
import PublicPropertyPage from './components/PublicPropertyPage';
import PublicPropertyLandingPage from './components/PublicPropertyLandingPage';
import SettingsPage from './components/SettingsPage';
import CompanyPublicPropertiesPage from './components/CompanyPublicPropertiesPage';
import StripeCheckoutPage from './components/StripeCheckoutPage';
import PlatformAdminPage from './components/PlatformAdminPage';
import ClientProfilePage from './components/ClientProfilePage';
import NotificationsPage from './components/NotificationsPage';
import { initMarketingTrackingBridge } from './lib/marketingTracking';
import './style.css';

initMarketingTrackingBridge();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/app" element={<App />} />
        <Route path="/app/property/:id" element={<App />} />
        <Route path="/app/clients/:clientKey" element={<ClientProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/platform-admin" element={<PlatformAdminPage />} />
        <Route path="/billing/checkout" element={<StripeCheckoutPage />} />
        <Route path="/share/:id" element={<PublicPropertyPage />} />
        <Route path="/p/:id" element={<PublicPropertyPage />} />
        <Route path="/public/property/:id" element={<PublicPropertyPage />} />
        <Route path="/ad/:id" element={<PublicPropertyLandingPage />} />
        <Route path="/public/ad/:id" element={<PublicPropertyLandingPage />} />
        <Route path="/share/company/:ownerId" element={<CompanyPublicPropertiesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
