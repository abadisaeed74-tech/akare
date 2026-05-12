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
  property_code?: string | null;
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
  // Match level from client request matching (1-4)
  _match_level?: number;
  match_level?: number;
  match_score?: number;
}

export interface UserPublic {
  id: string | null;
  email: string;
  display_name?: string | null;
  role?: 'owner' | 'manager' | 'employee';
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
  // Optional UI fields for frontend display
  description?: string | null;
  badge?: string | null;
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
  role: 'owner' | 'manager' | 'employee';
  status: 'active' | 'disabled';
  display_name?: string | null;
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

export interface ClientRequest {
  id: string;
  owner_id: string;
  raw_text: string;
  client_name: string;
  phone_number?: string | null;
  property_type: string;
  city: string;
  neighborhoods: string[];
  budget_min?: number | null;
  budget_max?: number | null;
  area_min?: number | null;
  area_max?: number | null;
  additional_requirements: string;
  action_plan: string;
  reminder_type?: 'follow_up' | 'viewing' | null;
  deadline_at?: string | null;
  reminder_before_minutes?: number;
  reminder_sent_at?: string | null;
  status: 'new' | 'searching' | 'closed';
  // NEW: Follow-up details - what the employee will do with the client
  follow_up_details?: string | null;
  created_at: string;
  updated_at: string;
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
  // Keep host-agnostic path in DB, resolve absolute URL only at render time.
  return response.data.url as string;
};

export const createProperty = async (payload: {
  raw_text: string;
  input_mode?: 'ai' | 'manual';
  city?: string;
  neighborhood?: string;
  property_type?: string;
  area?: number | null;
  price?: number | null;
  details?: string;
  owner_name?: string;
  owner_contact_number?: string;
  marketer_contact_number?: string;
  formatted_description?: string;
  region_within_city?: string;
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

export const updateMyDisplayName = async (displayName: string | null): Promise<UserPublic> => {
  const response = await apiClient.put('/me/display-name', { display_name: displayName });
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
  role?: 'manager' | 'employee';
  display_name?: string;
  permissions?: Record<string, boolean>;
}

export interface EmployeeUpdatePayload {
  status?: 'active' | 'disabled';
  role?: 'manager' | 'employee';
  display_name?: string;
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
  const response = await apiClient.get(`/public/properties/${id}`, { withCredentials: true });
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

export const createClientRequest = async (raw_text: string): Promise<ClientRequest> => {
  const response = await apiClient.post('/clients', { raw_text });
  return response.data;
};

// Create client request with pre-filled client info (for client profile page)
export const createClientRequestWithClient = async (
  raw_text: string,
  client_name: string,
  phone_number?: string | null,
): Promise<ClientRequest> => {
  const response = await apiClient.post('/clients', { 
    raw_text,
    client_name,
    phone_number: phone_number || null,
  });
  return response.data;
};

export const getClientRequests = async (): Promise<ClientRequest[]> => {
  const response = await apiClient.get('/clients');
  return response.data;
};

export const updateClientRequest = async (
  requestId: string,
  payload: {
    client_name?: string;
    phone_number?: string | null;
    property_type?: string;
    city?: string;
    neighborhoods?: string[];
    budget_min?: number | null;
    budget_max?: number | null;
    area_min?: number | null;
    area_max?: number | null;
    additional_requirements?: string;
    action_plan?: string;
    reminder_type?: 'follow_up' | 'viewing' | null;
    deadline_at?: string | null;
    reminder_before_minutes?: number;
    reminder_sent_at?: string | null;
    status?: 'new' | 'searching' | 'closed';
    follow_up_details?: string | null;
  },
): Promise<ClientRequest> => {
  const response = await apiClient.put(`/clients/${requestId}`, payload);
  return response.data;
};

export const getClientRequestMatches = async (requestId: string): Promise<Property[]> => {
  const response = await apiClient.get(`/clients/${requestId}/matches`);
  return response.data;
};

export const deleteClientRequest = async (requestId: string): Promise<void> => {
  await apiClient.delete(`/clients/${requestId}`);
};

// ===== Client Request Notes API =====

export interface ClientNote {
  id: string;
  request_id: string;
  owner_id: string;
  content: string;
  author_name: string;
  author_role: string;
  color: string;
  created_at: string;
}

export const createClientNote = async (
  requestId: string,
  payload: { content: string; author_name?: string; author_role?: string; color?: string }
): Promise<ClientNote> => {
  const response = await apiClient.post(`/clients/${requestId}/notes`, payload);
  return response.data;
};

export const getClientNotes = async (requestId: string): Promise<ClientNote[]> => {
  const response = await apiClient.get(`/clients/${requestId}/notes`);
  return response.data;
};

export const updateClientNote = async (
  requestId: string,
  noteId: string,
  payload: { content?: string; author_name?: string; author_role?: string; color?: string }
): Promise<ClientNote> => {
  const response = await apiClient.put(`/clients/${requestId}/notes/${noteId}`, payload);
  return response.data;
};

export const deleteClientNote = async (requestId: string, noteId: string): Promise<void> => {
  await apiClient.delete(`/clients/${requestId}/notes/${noteId}`);
};

// ===== Client Offers API =====

export interface ClientOffer {
  id: string;
  owner_id: string;
  client_name: string;
  phone_number?: string | null;
  property_id: string;
  status: 'active' | 'archived' | 'new' | 'working' | 'closed';
  notes: string;
  reminder_type?: 'follow_up' | 'viewing' | null;
  deadline_at?: string | null;
  reminder_before_minutes?: number;
  // NEW: Follow-up details - what the employee will do with the client
  follow_up_details?: string | null;
  created_at: string;
}

export const createClientOffer = async (payload: {
  client_name: string;
  phone_number?: string | null;
  property_id: string;
  follow_up_details?: string | null;
}): Promise<ClientOffer> => {
  const response = await apiClient.post('/clients/offers', payload);
  return response.data;
};

export const getClientOffers = async (): Promise<ClientOffer[]> => {
  const response = await apiClient.get('/clients/offers');
  return response.data;
};

export const getClientOffersByClient = async (
  clientName: string,
  phoneNumber?: string | null
): Promise<ClientOffer[]> => {
  const params: any = { client_name: clientName };
  if (phoneNumber) params.phone_number = phoneNumber;
  const response = await apiClient.get('/clients/offers/by-client', { params });
  return response.data;
};

// Get single client offer by ID (includes reminder/notes)
export const getClientOffer = async (offerId: string): Promise<ClientOffer> => {
  const response = await apiClient.get(`/clients/offers/${offerId}`);
  return response.data;
};

export const updateClientOffer = async (
  offerId: string,
  payload: {
    client_name?: string;
    phone_number?: string | null;
    status?: 'active' | 'archived' | 'new' | 'working' | 'closed';
    notes?: string;
    reminder_type?: 'follow_up' | 'viewing' | null;
    deadline_at?: string | null;
    reminder_before_minutes?: number;
    follow_up_details?: string | null;
  },
): Promise<ClientOffer> => {
  const response = await apiClient.put(`/clients/offers/${offerId}`, payload);
  return response.data;
};

export const deleteClientOffer = async (offerId: string): Promise<void> => {
  await apiClient.delete(`/clients/offers/${offerId}`);
};

// ===== Client Offer Notes API =====

export const createClientOfferNote = async (
  offerId: string,
  payload: { content: string; author_name?: string; author_role?: string; color?: string }
): Promise<ClientNote> => {
  const response = await apiClient.post(`/clients/offers/${offerId}/notes`, payload);
  return response.data;
};

export const getClientOfferNotes = async (offerId: string): Promise<ClientNote[]> => {
  const response = await apiClient.get(`/clients/offers/${offerId}/notes`);
  return response.data;
};

export const updateClientOfferNote = async (
  offerId: string,
  noteId: string,
  payload: { content?: string; author_name?: string; author_role?: string; color?: string }
): Promise<ClientNote> => {
  const response = await apiClient.put(`/clients/offers/${offerId}/notes/${noteId}`, payload);
  return response.data;
};

export const deleteClientOfferNote = async (offerId: string, noteId: string): Promise<void> => {
  await apiClient.delete(`/clients/offers/${offerId}/notes/${noteId}`);
};

// Register a client without an offer (just for tracking)
export const registerClientOnly = async (
  clientName: string,
  phoneNumber?: string | null
): Promise<{ exists: boolean; client_name: string; offers_count?: number; id?: string }> => {
  const params: any = { client_name: clientName };
  if (phoneNumber) params.phone_number = phoneNumber;
  const response = await apiClient.post('/clients/register', null, { params });
  return response.data;
};

// ===== Client Profiles API =====

export interface ClientProfile {
  id: string;
  owner_id: string;
  client_name: string;
  phone_number?: string | null;
  notes: string;
  client_types?: string[];  // NEW: ["request"] | ["offer"] | ["request", "offer"]
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  created_at: string;
  updated_at: string;
}

export const createClientProfile = async (payload: {
  client_name: string;
  phone_number?: string | null;
  notes?: string;
  client_types?: string[];  // NEW
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
}): Promise<ClientProfile> => {
  const response = await apiClient.post('/clients/profiles', payload);
  return response.data;
};

export const getClientProfiles = async (): Promise<ClientProfile[]> => {
  const response = await apiClient.get('/clients/profiles');
  return response.data;
};

export const getClientProfile = async (profileId: string): Promise<ClientProfile> => {
  const response = await apiClient.get(`/clients/profiles/${profileId}`);
  return response.data;
};

// NEW: Get client profiles filtered by type (for tabs)
// This returns persistent profiles with the specified client_type
export const getClientProfilesByType = async (clientType: 'request' | 'offer'): Promise<ClientProfile[]> => {
  const response = await apiClient.get(`/clients/profiles`, { params: { client_type: clientType } });
  return response.data;
};

// NEW: Get client profile by client name and phone (for client profile page)
// This fetches the persistent client profile for a client
export const getClientProfileByClient = async (
  clientName: string,
  phoneNumber?: string | null
): Promise<ClientProfile | null> => {
  try {
    const params: any = { client_name: clientName };
    if (phoneNumber) params.phone_number = phoneNumber;
    const response = await apiClient.get('/clients/profiles', { params });
    const profiles = response.data as ClientProfile[];
    // Find matching profile by name and phone
    const profile = profiles.find(p => 
      p.client_name?.toLowerCase() === clientName.toLowerCase() &&
      (phoneNumber ? p.phone_number === phoneNumber : !p.phone_number)
    );
    return profile || null;
  } catch {
    return null;
  }
};

export const updateClientProfile = async (
  profileId: string,
  payload: {
    client_name?: string;
    phone_number?: string | null;
    notes?: string;
    client_types?: string[];  // NEW
    assigned_user_id?: string | null;
    assigned_user_name?: string | null;
  },
): Promise<ClientProfile> => {
  const response = await apiClient.put(`/clients/profiles/${profileId}`, payload);
  return response.data;
};

export const deleteClientProfile = async (profileId: string): Promise<void> => {
  await apiClient.delete(`/clients/profiles/${profileId}`);
};

export const resolveMediaUrl = (path: string): string => {
  if (!path) return '';
  const normalizedInput = String(path).trim().replace(/\\/g, '/');
  if (!normalizedInput) return '';

  // لو الرابط كامل (ABSOLUTE URL)
  if (normalizedInput.startsWith('http://') || normalizedInput.startsWith('https://')) {
    try {
      const url = new URL(normalizedInput);
      const hostname = url.hostname;
      if (url.pathname.startsWith('/uploads/')) {
        return `${API_BASE_URL}${url.pathname}`;
      }

      // لو كان مخزن كرابط لوكال (localhost / 127.0.0.1 / 0.0.0.0) نحوله للباصلينك الحالي
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
        return `${API_BASE_URL}${url.pathname}`;
      }

      // غير كذا خله زي ما هو (مثلاً Google Maps أو دومين عام)
      return normalizedInput;
    } catch {
      // لو فشل الـ URL parsing نرجع المسار كما هو
      return normalizedInput;
    }
  }

  if (normalizedInput.startsWith('/uploads/')) {
    return `${API_BASE_URL}${normalizedInput}`;
  }

  if (normalizedInput.startsWith('uploads/')) {
    return `${API_BASE_URL}/${normalizedInput}`;
  }

  const uploadsMarkerIndex = normalizedInput.indexOf('/uploads/');
  if (uploadsMarkerIndex >= 0) {
    return `${API_BASE_URL}${normalizedInput.slice(uploadsMarkerIndex)}`;
  }

  // Legacy fallback: only file name saved in DB
  if (!normalizedInput.includes('/')) {
    return `${API_BASE_URL}/uploads/${normalizedInput}`;
  }

  // Generic relative path
  return normalizedInput.startsWith('/')
    ? `${API_BASE_URL}${normalizedInput}`
    : `${API_BASE_URL}/${normalizedInput}`;
};

// ===== Appointments API =====

export interface Appointment {
  id: string;
  type: 'request' | 'offer';
  client_name: string;
  phone_number?: string | null;
  property_type?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  property_id?: string | null;
  reminder_type?: 'follow_up' | 'viewing' | null;
  deadline_at?: string | null;
  reminder_before_minutes?: number;
  follow_up_details?: string | null;
  status: string;
  created_at: string;
// حقول إضافية مطلوبة للعرض والتصفح
  source_id?: string;
  client_key?: string;
  title?: string;
  source_type?: string; // "request" or "offer"
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
}

export const getAppointments = async (params?: {
  date_filter?: 'today' | 'this_week' | 'delayed';
  employee_id?: string;
}): Promise<Appointment[]> => {
  const response = await apiClient.get('/appointments', { params });
  return response.data;
};
