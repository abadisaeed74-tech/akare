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
  landing_form_enabled?: boolean;
  landing_primary_cta?: 'whatsapp' | 'call' | 'inquiry' | 'mixed';
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
  permissions?: EmployeePermissions | null;
}

export interface EmployeePermissions {
  can_add_property?: boolean;
  can_edit_property?: boolean;
  can_delete_property?: boolean;
  can_manage_files?: boolean;
  can_view_all_properties?: boolean;
  can_view_assigned_only?: boolean;
  can_manage_clients?: boolean;
  can_view_all_clients?: boolean;
  can_view_own_clients_only?: boolean;
  can_manage_appointments?: boolean;
  can_view_analytics?: boolean;
  can_export_data?: boolean;
  can_change_assignee?: boolean;
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
  permissions?: EmployeePermissions | null;
  assigned_clients_count?: number | null;
  assigned_properties_count?: number | null;
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
  total_client_requests?: number;
  total_client_offers?: number;
  recent_inquiries: PropertyInquiry[];
}

export interface ClientRequest {
  id: string;
  owner_id: string;
  raw_text: string;
  client_name: string;
  phone_number?: string | null;
  profile_id?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
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
  lead_source?: string | null;
  related_property_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingLead {
  id: string;
  owner_id: string;
  property_id: string;
  name: string;
  phone: string;
  notes?: string | null;
  request_type: 'general' | 'visit' | 'location' | 'similar' | 'booking';
  ad_source: 'tiktok' | 'snapchat' | 'instagram' | 'youtube' | 'google' | 'direct' | 'other' | 'unknown';
  source_page: string;
  status: 'new' | 'contacted' | 'qualified' | 'closed';
  visit_count: number;
  clicked_whatsapp: boolean;
  viewed_video: boolean;
  watched_video: boolean;
  completed_video: boolean;
  submitted_form: boolean;
  session_id?: string | null;
  session_started_at?: string | null;
  session_last_activity_at?: string | null;
  session_duration_seconds: number;
  referrer?: string | null;
  landing_url?: string | null;
  browser_name?: string | null;
  device_type?: string | null;
  converted_to_client: boolean;
  converted_client_type?: 'request' | 'profile' | null;
  converted_client_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingOverview {
  leads_today: number;
  leads_month: number;
  conversion_rate: number;
  clicks_count: number;
  visits_count: number;
  unique_visitors_count: number;
  average_session_duration_seconds: number;
  top_source: string;
  source_breakdown: Record<string, number>;
  top_properties: Array<{ property_id: string; leads: number }>;
}

export interface MarketingLandingPageStat {
  property_id: string;
  leads_count: number;
  visits_count: number;
  unique_visitors_count: number;
  conversion_rate: number;
  top_source: string;
}

export interface MarketingAnalytics {
  daily_leads: Array<{ period: string; count: number }>;
  weekly_leads: Array<{ period: string; count: number }>;
  monthly_leads: Array<{ period: string; count: number }>;
  source_breakdown: Record<string, number>;
  cta_breakdown: Record<string, number>;
}

export interface MarketingLandingSourceStat {
  source: string;
  visits: number;
  clicks: number;
  leads: number;
  conversion_rate: number;
}

export interface MarketingLandingSessionActivity {
  source: string;
  activity: string;
  session_duration_seconds: number;
  happened_at: string;
  device_type: string;
}

export interface MarketingLandingPageDetails {
  property_id: string;
  visits_count: number;
  unique_visitors_count: number;
  average_session_duration_seconds: number;
  leads_count: number;
  conversion_rate: number;
  traffic_sources: MarketingLandingSourceStat[];
  cta_breakdown: Record<string, number>;
  funnel: Array<{ label: string; value: number }>;
  session_activity: MarketingLandingSessionActivity[];
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
  landing_form_enabled?: boolean;
  landing_primary_cta?: 'whatsapp' | 'call' | 'inquiry' | 'mixed';
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
  payload: { action: 'extend' | 'grant_free' | 'cancel'; days?: number; plan_key?: string },
): Promise<CompanySettings> => {
  const response = await apiClient.post(
    `/admin/platform-offices/${ownerUserId}/subscription-action`,
    payload,
  );
  return response.data;
};

export const platformAdminDeleteOffice = async (ownerUserId: string): Promise<void> => {
  await apiClient.delete(`/admin/platform-offices/${ownerUserId}`);
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
  permissions?: EmployeePermissions;
}

export interface EmployeeUpdatePayload {
  status?: 'active' | 'disabled';
  role?: 'manager' | 'employee';
  display_name?: string;
  permissions?: EmployeePermissions;
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

const PUBLIC_PROPERTY_VIEW_KEY = 'akare_public_pv_';
const PUBLIC_PROPERTY_VIEW_TTL_MS = 24 * 60 * 60 * 1000;
const publicPropertyInflight = new Map<string, Promise<Property>>();

export const getPublicProperty = async (id: string): Promise<Property> => {
  const existing = publicPropertyInflight.get(id);
  if (existing) return existing;

  let skipViewCount = false;
  try {
    const raw = localStorage.getItem(PUBLIC_PROPERTY_VIEW_KEY + id);
    if (raw) {
      const t = parseInt(raw, 10);
      if (!Number.isNaN(t) && Date.now() - t < PUBLIC_PROPERTY_VIEW_TTL_MS) {
        skipViewCount = true;
      }
    }
  } catch {
    /* private mode */
  }

  const promise = (async () => {
    const headers: Record<string, string> = {};
    if (skipViewCount) headers['X-Akare-Skip-View-Count'] = '1';
    const response = await apiClient.get(`/public/properties/${id}`, {
      withCredentials: true,
      headers,
    });
    if (!skipViewCount) {
      try {
        localStorage.setItem(PUBLIC_PROPERTY_VIEW_KEY + id, String(Date.now()));
      } catch {
        /* ignore */
      }
    }
    return response.data as Property;
  })();

  publicPropertyInflight.set(id, promise);
  try {
    return await promise;
  } finally {
    publicPropertyInflight.delete(id);
  }
};

export const resolvePublicVideoUrl = async (shareUrl: string): Promise<string> => {
  const response = await apiClient.get<{ url: string }>('/public/resolve-video-url', {
    params: { url: shareUrl },
  });
  const u = (response.data?.url || '').trim();
  if (!u) throw new Error('empty resolved url');
  return u;
};

export const createPublicPropertyInquiry = async (
  propertyId: string,
  payload: {
    name?: string;
    phone?: string;
    message: string;
    request_type?: 'general' | 'visit' | 'location' | 'similar' | 'booking';
    source?: 'public_page' | 'landing_page';
  },
): Promise<PropertyInquiry> => {
  const response = await apiClient.post(`/public/properties/${propertyId}/inquiries`, payload);
  return response.data;
};

export const createPublicMarketingEvent = async (payload: {
  property_id: string;
  event_type: 'landing_visit' | 'session_end' | 'cta_whatsapp_click' | 'cta_call_click' | 'cta_primary_click' | 'video_view' | 'video_complete' | 'form_view' | 'form_submit';
  ad_source?: 'tiktok' | 'snapchat' | 'instagram' | 'youtube' | 'google' | 'direct' | 'other' | 'unknown';
  session_id?: string;
  metadata?: Record<string, string>;
}): Promise<void> => {
  await apiClient.post('/public/marketing/events', payload);
};

export const createPublicMarketingLead = async (payload: {
  property_id: string;
  name: string;
  phone: string;
  notes?: string;
  request_type: 'general' | 'visit' | 'location' | 'similar' | 'booking';
  ad_source?: 'tiktok' | 'snapchat' | 'instagram' | 'youtube' | 'google' | 'direct' | 'other' | 'unknown';
  session_id?: string;
  source_page?: string;
  referrer?: string;
  landing_url?: string;
  browser_name?: string;
  device_type?: string;
}): Promise<MarketingLead> => {
  const response = await apiClient.post('/public/marketing/leads', payload);
  return response.data;
};

export const getMarketingOverview = async (): Promise<MarketingOverview> => {
  const response = await apiClient.get('/marketing/overview');
  return response.data;
};

export const getMarketingLeads = async (): Promise<MarketingLead[]> => {
  const response = await apiClient.get('/marketing/leads');
  return response.data;
};

export const updateMarketingLeadStatus = async (
  leadId: string,
  status: 'new' | 'contacted' | 'qualified' | 'closed',
): Promise<MarketingLead> => {
  const response = await apiClient.put(`/marketing/leads/${leadId}/status`, { status });
  return response.data;
};

export const updateMarketingLead = async (
  leadId: string,
  payload: { status?: 'new' | 'contacted' | 'qualified' | 'closed'; notes?: string },
): Promise<MarketingLead> => {
  const response = await apiClient.put(`/marketing/leads/${leadId}`, payload);
  return response.data;
};

export const convertMarketingLead = async (
  leadId: string,
  target_type: 'request' | 'profile',
): Promise<MarketingLead> => {
  const response = await apiClient.post(`/marketing/leads/${leadId}/convert`, { target_type });
  return response.data;
};

export const getMarketingLandingPages = async (): Promise<MarketingLandingPageStat[]> => {
  const response = await apiClient.get('/marketing/landing-pages');
  return response.data;
};

export const getMarketingLandingPageDetails = async (propertyId: string): Promise<MarketingLandingPageDetails> => {
  const response = await apiClient.get(`/marketing/landing-pages/${propertyId}/details`);
  return response.data;
};

export const getMarketingAnalytics = async (): Promise<MarketingAnalytics> => {
  const response = await apiClient.get('/marketing/analytics');
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

export const createClientRequest = async (data: {
  raw_text: string;
  profile_id?: string;
  client_name?: string;
  phone_number?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
}): Promise<ClientRequest> => {
  const response = await apiClient.post('/clients', data);
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
    assigned_user_id?: string | null;
    assigned_user_name?: string | null;
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
  profile_id?: string | null;
  client_name: string;
  phone_number?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
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
  profile_id?: string | null;
  client_name: string;
  phone_number?: string | null;
  property_id: string;
  follow_up_details?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
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
  phoneNumber?: string | null,
  profileId?: string | null,
): Promise<ClientOffer[]> => {
  const params: any = { client_name: clientName };
  if (phoneNumber) params.phone_number = phoneNumber;
  if (profileId) params.profile_id = profileId;
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
    assigned_user_id?: string | null;
    assigned_user_name?: string | null;
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

const digitsOnly = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

const phonesLooseEqual = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da && !db) return true;
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9)) return true;
  return false;
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
    const targetName = (clientName || '').trim().toLowerCase();
    const withName = profiles.filter(
      (p) => (p.client_name || '').trim().toLowerCase() === targetName,
    );
    if (!withName.length) return null;

    const phone = phoneNumber != null ? String(phoneNumber).trim() : '';
    if (!phone) {
      const noPhone = withName.filter((p) => !digitsOnly(p.phone_number));
      if (noPhone.length === 1) return noPhone[0];
      if (withName.length === 1) return withName[0];
      return noPhone[0] ?? withName[0] ?? null;
    }

    const byLoosePhone = withName.find((p) => phonesLooseEqual(p.phone_number, phone));
    return byLoosePhone ?? withName[0] ?? null;
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

// ===== Client Stats API =====

export interface ClientOffersStats {
  total_offers: number;
  active_offers: number;
  new_last_30_days: number;
  percentage_change: number;
  active_percentage_change: number;
  new_percentage_change: number;
}

export interface ClientRequestsStats {
  total_requests: number;
  active_requests: number;
  new_requests: number;
  new_last_30_days: number;
  percentage_change: number;
  active_percentage_change: number;
  new_percentage_change: number;
}

export interface ClientProfilesStats {
  total_clients: number;
  new_last_30_days: number;
  percentage_change: number;
}

export const getClientOffersStats = async (): Promise<ClientOffersStats> => {
  const response = await apiClient.get('/clients/offers/stats');
  return response.data;
};

export const getClientRequestsStats = async (): Promise<ClientRequestsStats> => {
  const response = await apiClient.get('/clients/requests/stats');
  return response.data;
};

export const getClientProfilesStats = async (): Promise<ClientProfilesStats> => {
  const response = await apiClient.get('/clients/profiles/stats');
  return response.data;
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

export interface NotificationItem {
  id: string;
  user_id: string;
  owner_id?: string | null;
  type: string;
  category: string;
  title: string;
  message: string;
  read: boolean;
  priority: 'low' | 'normal' | 'high';
  link?: string | null;
  metadata?: Record<string, string>;
  created_at: string;
  read_at?: string | null;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
  page: number;
  page_size: number;
}

export const getAppointments = async (params?: {
  date_filter?: 'today' | 'this_week' | 'delayed';
  employee_id?: string;
}): Promise<Appointment[]> => {
  const response = await apiClient.get('/appointments', { params });
  return response.data;
};

export const getNotifications = async (params?: {
  unread_only?: boolean;
  category?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<NotificationsResponse> => {
  const response = await apiClient.get('/notifications', { params });
  return response.data;
};

export const getUnreadNotificationsCount = async (): Promise<number> => {
  const response = await apiClient.get('/notifications/unread-count');
  return Number(response.data?.count || 0);
};

export const markNotificationRead = async (notificationId: string): Promise<NotificationItem> => {
  const response = await apiClient.put(`/notifications/${notificationId}/read`);
  return response.data;
};

export const markAllNotificationsRead = async (): Promise<number> => {
  const response = await apiClient.put('/notifications/read-all');
  return Number(response.data?.modified_count || 0);
};

export const deleteNotification = async (notificationId: string): Promise<void> => {
  await apiClient.delete(`/notifications/${notificationId}`);
};
