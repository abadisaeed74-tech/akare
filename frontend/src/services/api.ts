import axios from 'axios';

// Base URL for the backend API and media files
// Priority:
// 1) VITE_API_BASE_URL (Vercel/production)
// 2) localhost fallback for local development
// 3) Render fallback
const LOCAL_API_BASE_URL = 'http://localhost:8000';
const RENDER_API_BASE_URL = 'https://akare.onrender.com';
const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = ENV_API_BASE_URL
  ? ENV_API_BASE_URL
  : (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    )
    ? LOCAL_API_BASE_URL
    : RENDER_API_BASE_URL;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const setAuthToken = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('access_token', token);
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
    localStorage.removeItem('access_token');
  }
};

// Initialize token from localStorage on load
const existingToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
if (existingToken) {
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${existingToken}`;
}

export interface Property {
  id: string | null;
  city: string;
  neighborhood: string;
  property_type: string;
  area: number;
  price: number;
  details?: string;
  owner_name?: string;
  owner_contact_number?: string;
  marketer_contact_number?: string;
  formatted_description?: string;
  raw_text: string;
  owner_id?: string | null;
  // Optional media & links
  images?: string[];
  videos?: string[];
  documents?: string[];
  map_url?: string | null;
  view_count?: number;
}

export interface UserPublic {
  id: string | null;
  email: string;
  role?: 'owner' | 'employee';
  status?: 'active' | 'disabled';
  company_owner_id?: string | null;
  permissions?: {
    can_add_property?: boolean;
    can_edit_property?: boolean;
    can_delete_property?: boolean;
    can_manage_files?: boolean;
  } | null;
}

// ===== Settings / Plans / Company types =====

export interface PlanInfo {
  key: string;
  name: string;
  max_users: number;
  max_properties: number;
  max_storage_mb?: number | null;
  allow_custom_subdomain: boolean;
  price_monthly_sar?: number | null;
}

export interface PlanUsage {
  plan: PlanInfo;
  current_users: number;
  current_properties: number;
  used_storage_mb?: number | null;
}

export interface CompanySettings {
  company_name?: string;
  logo_url?: string;
  official_email?: string;
  contact_phone?: string;
  subdomain?: string;
  plan_key: string;
  is_subscribed?: boolean;
  subscription_started_at?: string | null;
  subscription_ends_at?: string | null;
  billing_status?: string | null;
  cancel_at_period_end?: boolean;
  trial_used?: boolean;
}

export interface TeamUser {
  id: string;
  email: string;
  role: 'owner' | 'employee';
  status: 'active' | 'disabled';
  permissions?: {
    can_add_property?: boolean;
    can_edit_property?: boolean;
    can_delete_property?: boolean;
    can_manage_files?: boolean;
  } | null;
}

export interface SettingsOverview {
  company: CompanySettings;
  plan_usage: PlanUsage;
  team: TeamUser[];
}

export interface PublicCompany {
  company_name?: string;
  logo_url?: string;
  official_email?: string;
  contact_phone?: string;
  subdomain?: string;
}

export interface PropertyInquiry {
  id: string;
  property_id: string;
  owner_id: string;
  property_title?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  name?: string | null;
  phone?: string | null;
  message: string;
  status: 'new' | 'responded';
  responded_at?: string | null;
  created_at: string;
}

export interface DashboardOverview {
  total_properties: number;
  total_views: number;
  total_inquiries: number;
  recent_inquiries: PropertyInquiry[];
}

export interface PlatformStats {
  total_users: number;
  total_owners: number;
  total_employees: number;
  total_offices: number;
  total_properties: number;
  subscribed_offices: number;
  trialing_offices: number;
  unsubscribed_offices: number;
}

export interface PlatformPropertyMini {
  id?: string | null;
  city: string;
  neighborhood: string;
  property_type: string;
  area: number;
  price: number;
  owner_name?: string | null;
}

export interface PlatformOfficeSummary {
  owner_user_id: string;
  owner_email?: string | null;
  company_name?: string | null;
  plan_key: string;
  is_subscribed: boolean;
  billing_status?: string | null;
  trial_used: boolean;
  subscription_started_at?: string | null;
  subscription_ends_at?: string | null;
  total_properties: number;
  total_employees: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PlatformOfficeDetail extends PlatformOfficeSummary {
  contact_phone?: string | null;
  official_email?: string | null;
  subdomain?: string | null;
  employees: TeamUser[];
  properties: PlatformPropertyMini[];
}

export const uploadFile = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const path = response.data.url as string;
  // Store absolute URL on the client so clicking in upload list لا يمر عبر React Router
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
};

export const createProperty = async (payload: {
  raw_text: string;
  images?: string[];
  videos?: string[];
  documents?: string[];
  map_url?: string | null;
}): Promise<Property> => {
  const response = await apiClient.post('/properties', payload);
  return response.data;
};

export const getProperties = async (params: any): Promise<Property[]> => {
    const response = await apiClient.get('/properties', { params });
    return response.data;
};

export const updateProperty = async (id: string | null, data: Partial<Property>): Promise<Property> => {
  if (!id) {
    throw new Error('Invalid property id');
  }
  const response = await apiClient.put(`/properties/${id}`, data);
  return response.data;
};

export const deleteProperty = async (id: string | null): Promise<void> => {
  if (!id) {
    throw new Error('Invalid property id');
  }
  await apiClient.delete(`/properties/id/${id}`);
};

export const deletePropertyByRawText = async (raw_text: string): Promise<void> => {
  await apiClient.delete('/properties/by-raw-text', { params: { raw_text } });
};

export const deletePropertiesByCity = async (city: string): Promise<void> => {
  await apiClient.delete('/properties/by-city', { params: { city } });
};

export const deletePropertiesByNeighborhood = async (city: string | null, neighborhood: string): Promise<void> => {
  const params: any = { neighborhood };
  if (city) params.city = city;
  await apiClient.delete('/properties/by-neighborhood', { params });
};

export const registerUser = async (data: { email: string; password: string }): Promise<UserPublic> => {
  const response = await apiClient.post('/auth/register', data);
  return response.data;
};

export const loginUser = async (email: string, password: string): Promise<{ access_token: string; token_type: string }> => {
  const formData = new URLSearchParams();
  formData.append('username', email);
  formData.append('password', password);
  const response = await apiClient.post('/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data;
};

export const getCurrentUser = async (): Promise<UserPublic> => {
  const response = await apiClient.get('/me');
  return response.data;
};

export const getPlatformStats = async (): Promise<PlatformStats> => {
  const response = await apiClient.get('/admin/platform-stats');
  return response.data;
};

export const getPlatformOffices = async (): Promise<PlatformOfficeSummary[]> => {
  const response = await apiClient.get('/admin/platform-offices');
  return response.data;
};

export const getPlatformOfficeDetail = async (
  ownerUserId: string,
): Promise<PlatformOfficeDetail> => {
  const response = await apiClient.get(`/admin/platform-offices/${ownerUserId}`);
  return response.data;
};

export const platformAdminSubscriptionAction = async (
  ownerUserId: string,
  payload: { action: 'extend' | 'grant_free' | 'cancel'; days?: number },
): Promise<CompanySettings> => {
  const response = await apiClient.post(
    `/admin/platform-offices/${ownerUserId}/subscription-action`,
    payload,
  );
  return response.data;
};

// ===== Settings / Company API =====

export const getSettingsOverview = async (): Promise<SettingsOverview> => {
  const response = await apiClient.get('/settings/overview');
  return response.data;
};

export const updateCompanySettings = async (
  data: Partial<CompanySettings>,
): Promise<CompanySettings> => {
  const response = await apiClient.put('/settings/company', data);
  return response.data;
};

export const changePlan = async (plan_key: string): Promise<PlanUsage> => {
  const response = await apiClient.put('/settings/plan', { plan_key });
  return response.data;
};

export const activateSubscription = async (plan_key: string): Promise<CompanySettings> => {
  const response = await apiClient.post('/billing/activate-subscription', { plan_key });
  return response.data;
};

export const startFreeTrial = async (plan_key: string): Promise<CompanySettings> => {
  const response = await apiClient.post('/billing/start-free-trial', { plan_key });
  return response.data;
};

export const createStripeCheckoutSession = async (payload: {
  plan_key: string;
  success_url?: string;
  cancel_url?: string;
}): Promise<{ url: string; session_id?: string | null }> => {
  const response = await apiClient.post('/billing/checkout-session', payload);
  return response.data;
};

export const createStripePortalSession = async (
  returnUrl?: string,
): Promise<{ url: string }> => {
  const response = await apiClient.post('/billing/portal-session', null, {
    params: { return_url: returnUrl },
  });
  return response.data;
};

export const confirmStripeCheckoutSession = async (
  sessionId: string,
): Promise<CompanySettings> => {
  const response = await apiClient.post('/billing/confirm-checkout-session', null, {
    params: { session_id: sessionId },
  });
  return response.data;
};

export const checkSubdomainAvailability = async (
  subdomain: string,
): Promise<{ ok: boolean; message: string }> => {
  const response = await apiClient.post('/settings/subdomain/check', { subdomain });
  return response.data;
};

export const updateSubdomain = async (subdomain: string): Promise<CompanySettings> => {
  const response = await apiClient.put('/settings/subdomain', { subdomain });
  return response.data;
};

// ===== Public Company / Listings API =====

export const getPublicCompany = async (ownerId: string): Promise<PublicCompany> => {
  const response = await apiClient.get(`/public/companies/${ownerId}`);
  return response.data;
};

export const getPublicCompanyProperties = async (ownerId: string): Promise<Property[]> => {
  const response = await apiClient.get(`/public/companies/${ownerId}/properties`);
  return response.data;
};

export const publicCompanyAiSearch = async (ownerId: string, query: string): Promise<Property[]> => {
  const response = await apiClient.get(`/public/companies/${ownerId}/ai-search`, {
    params: { q: query },
  });
  return response.data;
};

// ===== Team / Employees API =====

export const getTeamUsers = async (): Promise<TeamUser[]> => {
  const response = await apiClient.get('/settings/team/users');
  return response.data;
};

export interface EmployeeCreatePayload {
  email: string;
  password: string;
  permissions?: Record<string, boolean>;
}

export interface EmployeeUpdatePayload {
  status?: 'active' | 'disabled';
  permissions?: Record<string, boolean>;
}

export const createEmployeeUser = async (payload: EmployeeCreatePayload): Promise<TeamUser> => {
  const response = await apiClient.post('/settings/team/users', payload);
  return response.data;
};

export const updateEmployeeUser = async (
  userId: string,
  payload: EmployeeUpdatePayload,
): Promise<TeamUser> => {
  const response = await apiClient.put(`/settings/team/users/${userId}`, payload);
  return response.data;
};

export const getCities = async (): Promise<string[]> => {
    const response = await apiClient.get('/cities');
    return response.data;
};

export const getNeighborhoods = async (city?: string): Promise<string[]> => {
    const params = city ? { city } : {};
    const response = await apiClient.get('/neighborhoods', { params });
    return response.data;
};

export const searchProperties = async (query: string): Promise<Property[]> => {
    const response = await apiClient.get('/search', { params: { q: query } });
    return response.data;
};

export const aiSearchProperties = async (query: string): Promise<Property[]> => {
  const response = await apiClient.get('/ai-search', { params: { q: query } });
  return response.data;
};

export const getPublicProperty = async (id: string): Promise<Property> => {
  const response = await apiClient.get(`/public/properties/${id}`);
  return response.data;
};

export const createPublicPropertyInquiry = async (
  propertyId: string,
  payload: { name?: string; phone?: string; message: string },
): Promise<PropertyInquiry> => {
  const response = await apiClient.post(`/public/properties/${propertyId}/inquiries`, payload);
  return response.data;
};

export const getDashboardOverview = async (): Promise<DashboardOverview> => {
  const response = await apiClient.get('/dashboard/overview');
  return response.data;
};

export const updateInquiryStatus = async (
  inquiryId: string,
  status: 'new' | 'responded',
): Promise<PropertyInquiry> => {
  const response = await apiClient.put(`/dashboard/inquiries/${inquiryId}/status`, { status });
  return response.data;
};

export const resolveMediaUrl = (path: string): string => {
  if (!path) return '';

  // لو الرابط كامل (ABSOLUTE URL)
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const url = new URL(path);
      const hostname = url.hostname;

      // لو كان مخزن كرابط لوكال (localhost / 127.0.0.1 / 0.0.0.0) نحوله للباصلينك الحالي
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
        return `${API_BASE_URL}${url.pathname}`;
      }

      // غير كذا خله زي ما هو (مثلاً Google Maps أو دومين عام)
      return path;
    } catch {
      // لو فشل الـ URL parsing نرجع المسار كما هو
      return path;
    }
  }

  // لو كان المسار نسبي مثل /uploads/xxx
  return `${API_BASE_URL}${path}`;
};
