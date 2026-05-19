import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Avatar, Form, Image, Input, Modal, Select, Skeleton, Tag, message } from 'antd';
import { motion } from 'framer-motion';
import {
  Building2,
  MessageCircle,
  Phone,
  PlayCircle,
  Share2,
} from 'lucide-react';
import type { Property, PublicCompany } from '../services/api';
import {
  createPublicMarketingEvent,
  createPublicMarketingLead,
  getPublicCompany,
  getPublicCompanyProperties,
  getPublicProperty,
  resolveMediaUrl,
} from '../services/api';
import SocialVideoEmbed from './SocialVideoEmbed';
import PublicPropertyCard from './public/PublicPropertyCard';

const hasText = (value?: string | null): boolean => !!value && value.trim() !== '' && value !== 'غير مذكور';

const normalizeSourceValue = (value: string): 'tiktok' | 'snapchat' | 'instagram' | 'youtube' | 'google' | 'direct' | 'unknown' => {
  const source = value.toLowerCase();
  if (source.includes('tiktok')) return 'tiktok';
  if (source.includes('snap')) return 'snapchat';
  if (source.includes('insta')) return 'instagram';
  if (source.includes('youtu')) return 'youtube';
  if (source.includes('google')) return 'google';
  if (source.includes('(direct)') || source.includes('(none)') || source.includes('direct')) return 'direct';
  if (source) return 'unknown';
  return 'direct';
};

const resolveReferrerSource = (): 'tiktok' | 'snapchat' | 'instagram' | 'youtube' | 'google' | 'direct' | 'unknown' => {
  if (typeof document === 'undefined') return 'direct';
  const ref = (document.referrer || '').trim();
  if (!ref) return 'direct';
  try {
    const host = new URL(ref).hostname.toLowerCase();
    return normalizeSourceValue(host);
  } catch {
    return 'unknown';
  }
};

const resolveAdSource = (): 'tiktok' | 'snapchat' | 'instagram' | 'youtube' | 'google' | 'direct' | 'unknown' => {
  if (typeof window === 'undefined') return 'direct';
  const params = new URLSearchParams(window.location.search);
  const directSource = (params.get('source') || params.get('utm_source') || '').trim();
  if (directSource) {
    const normalized = normalizeSourceValue(directSource);
    window.sessionStorage.setItem('akare-marketing-source', normalized);
    return normalized;
  }

  const key = 'akare-marketing-source';
  const existing = window.sessionStorage.getItem(key);
  if (existing) return normalizeSourceValue(existing);

  const fallback = resolveReferrerSource();
  window.sessionStorage.setItem(key, fallback);
  return fallback;
};

const getBrowserName = (): string => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('chrome/')) return 'chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'safari';
  if (ua.includes('firefox/')) return 'firefox';
  return 'other';
};

const getDeviceType = (): string => {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobile|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
};

const getSessionIdForProperty = (propertyId: string): string => {
  if (typeof window === 'undefined') return `${propertyId}-session`;
  const key = `akare-marketing-session-${propertyId}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const generated = `${propertyId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(key, generated);
  return generated;
};

const shouldTrackLandingVisit = (propertyId: string, sessionId: string): boolean => {
  if (typeof window === 'undefined') return true;
  const key = `akare-marketing-visited-${propertyId}-${sessionId}`;
  if (window.sessionStorage.getItem(key) === '1') {
    return false;
  }
  window.sessionStorage.setItem(key, '1');
  return true;
};

const getSessionStartTimestamp = (sessionId: string): number => {
  if (typeof window === 'undefined') return Date.now();
  const key = `akare-marketing-session-start-${sessionId}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) {
    const parsed = Number(existing);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  const now = Date.now();
  window.sessionStorage.setItem(key, String(now));
  return now;
};

const PublicPropertyLandingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [similarProperties, setSimilarProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);
  const [leadForm] = Form.useForm<{ name?: string; phone?: string; note?: string; request_type: 'general' | 'visit' | 'location' | 'similar' | 'booking' }>();
  const adSource = useMemo(() => resolveAdSource(), []);

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('لم يتم تحديد العقار.');
        setLoading(false);
        return;
      }
      try {
        const data = await getPublicProperty(id);
        setProperty(data);
        if (data.owner_id) {
          const [companyResult, propertiesResult] = await Promise.allSettled([
            getPublicCompany(data.owner_id),
            getPublicCompanyProperties(data.owner_id),
          ]);
          if (companyResult.status === 'fulfilled') setCompany(companyResult.value);
          if (propertiesResult.status === 'fulfilled') {
            setSimilarProperties(propertiesResult.value.filter((item) => item.id && item.id !== data.id).slice(0, 6));
          }
        }
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'تعذر تحميل صفحة الهبوط.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const images = useMemo(
    () => (property?.images || []).map((url) => resolveMediaUrl(url)).filter(Boolean),
    [property?.images],
  );

  const formEnabled = property?.landing_form_enabled !== false;
  const sessionId = property?.id ? getSessionIdForProperty(property.id) : 'landing-session';
  const sessionStartTs = useMemo(() => getSessionStartTimestamp(sessionId), [sessionId]);
  const trackingMetadata = useMemo(
    () => ({
      browser: getBrowserName(),
      device: getDeviceType(),
      referrer: typeof document !== 'undefined' ? (document.referrer || '') : '',
      landing_url: typeof window !== 'undefined' ? window.location.href : '',
      source: adSource,
    }),
    [adSource],
  );

  useEffect(() => {
    if (!property?.id) return;
    const w = window as Window & {
      __akareTrackEvent?: (name: string, payload?: Record<string, unknown>) => void;
    };
    w.__akareTrackEvent?.('landing_view', { property_id: property.id, source: 'landing_page' });
    if (shouldTrackLandingVisit(property.id, sessionId)) {
      void createPublicMarketingEvent({
        property_id: property.id,
        event_type: 'landing_visit',
        ad_source: adSource,
        session_id: sessionId,
        metadata: trackingMetadata,
      });
    }
  }, [adSource, property?.id, sessionId, trackingMetadata]);

  useEffect(() => {
    if (!property?.id || !formEnabled) return;
    void createPublicMarketingEvent({
      property_id: property.id,
      event_type: 'form_view',
      ad_source: adSource,
      session_id: sessionId,
      metadata: trackingMetadata,
    });
  }, [adSource, formEnabled, property?.id, sessionId, trackingMetadata]);

  useEffect(() => {
    if (!property?.id) return;
    const handlePageLeave = () => {
      const durationSeconds = Math.max(0, Math.round((Date.now() - sessionStartTs) / 1000));
      void createPublicMarketingEvent({
        property_id: property.id!,
        event_type: 'session_end',
        ad_source: adSource,
        session_id: sessionId,
        metadata: {
          ...trackingMetadata,
          duration_seconds: String(durationSeconds),
        },
      });
    };
    window.addEventListener('pagehide', handlePageLeave);
    return () => {
      window.removeEventListener('pagehide', handlePageLeave);
    };
  }, [adSource, property?.id, sessionId, sessionStartTs, trackingMetadata]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton.Image active className="!h-80 !w-full !rounded-3xl" />
          <Skeleton active paragraph={{ rows: 8 }} className="rounded-3xl bg-white p-8" />
        </div>
      </div>
    );
  }
  if (error || !property) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <Alert type="error" message={error || 'الصفحة غير متاحة.'} />
      </div>
    );
  }

  const contactPhone = (company?.contact_phone || property.marketer_contact_number || property.owner_contact_number || '').trim();
  const phoneDigits = contactPhone.replace(/[^\d]/g, '');
  const priceLabel =
    property.price && property.price > 0
      ? property.price.toLocaleString('ar-SA', { style: 'currency', currency: 'SAR' })
      : 'السعر عند التواصل';
  const locationLabel = [property.neighborhood, property.city].filter(hasText).join('، ');
  const propertyUrl = typeof window !== 'undefined' ? window.location.href : '';
  const waText = encodeURIComponent(`أرغب في الاستفسار عن هذا العقار.\n${property.property_type || 'عقار'}\n${propertyUrl}`);
  const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits}?text=${waText}` : null;
  const ctaMode = property.landing_primary_cta || 'whatsapp';

  return (
    <div
      dir="rtl"
      className="min-h-screen text-slate-100"
      style={{
        background:
          'radial-gradient(1200px 500px at 8% -5%, rgba(34,197,94,0.20), transparent 55%), radial-gradient(900px 420px at 92% 0%, rgba(56,189,248,0.20), transparent 58%), linear-gradient(160deg, #0f172a 0%, #172554 48%, #0b1220 100%)',
      }}
    >
      <section className="relative overflow-hidden">
        {images[0] ? (
          <img src={images[0]} alt={property.property_type || 'صورة العقار'} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/55 via-[#0f172a]/45 to-[#0b1220]/65" />

        <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-10 md:pt-10 md:pb-16">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-xl">
              {company?.logo_url ? (
                <Avatar src={resolveMediaUrl(company.logo_url)} size={40} />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <Building2 className="h-5 w-5" />
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">{company?.company_name || 'مكتب عقاري'}</p>
                <p className="text-xs text-slate-200/80">Ad Landing Page</p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(propertyUrl);
                  message.success('تم نسخ رابط الإعلان.');
                } catch {
                  message.info('تعذر نسخ الرابط الآن.');
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm backdrop-blur-xl"
            >
              <Share2 className="h-4 w-4" />
              نسخ الرابط
            </button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="max-w-3xl"
          >
            <Tag className="!mb-4 !rounded-full !border-none !bg-emerald-500/25 !text-emerald-200">
              فرصة استثمارية مميزة
            </Tag>
            <h1 className="text-3xl font-bold leading-tight md:text-5xl">
              {property.property_type || 'عقار فاخر'} {property.city ? `في ${property.city}` : ''}
            </h1>
            {locationLabel ? <p className="mt-4 text-lg text-slate-200">{locationLabel}</p> : null}
            <p className="mt-4 text-2xl font-bold text-emerald-300 md:text-4xl">{priceLabel}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    if (!property.id) return;
                    void createPublicMarketingEvent({
                      property_id: property.id,
                      event_type: 'cta_whatsapp_click',
                      ad_source: adSource,
                      session_id: sessionId,
                      metadata: trackingMetadata,
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-white"
                >
                  <MessageCircle className="h-5 w-5" />
                  واتساب
                </a>
              ) : null}
              {contactPhone ? (
                <a
                  href={`tel:${contactPhone}`}
                  onClick={() => {
                    if (!property.id) return;
                    void createPublicMarketingEvent({
                      property_id: property.id,
                      event_type: 'cta_call_click',
                      ad_source: adSource,
                      session_id: sessionId,
                      metadata: trackingMetadata,
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 py-3 font-semibold"
                >
                  <Phone className="h-5 w-5" />
                  اتصال
                </a>
              ) : null}
            </div>
          </motion.div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <section className="rounded-3xl border border-white/15 bg-slate-900/70 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.42)] backdrop-blur-xl">
          <h2 className="mb-4 text-2xl font-bold">معرض العقار</h2>
          {images.length ? (
            <Image.PreviewGroup items={images}>
              <div className="grid gap-3 md:grid-cols-4">
                {images.slice(0, 6).map((url, index) => (
                  <div key={`${url}-${index}`} className={`overflow-hidden rounded-2xl ${index === 0 ? 'h-56 md:col-span-2 md:h-80' : 'h-36 md:h-40'}`}>
                    <Image src={url} alt={`صورة ${index + 1}`} className="!h-full !w-full object-cover" />
                  </div>
                ))}
              </div>
            </Image.PreviewGroup>
          ) : (
            <Alert type="info" message="لا توجد صور مرفقة." />
          )}
        </section>

        {property.videos && property.videos.length > 0 && (
          <section className="rounded-3xl border border-white/15 bg-slate-900/70 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.42)] backdrop-blur-xl">
            <h3 className="mb-4 text-2xl font-bold">فيديوهات العقار</h3>
            <div className="grid gap-5">
              {property.videos.map((url, index) => {
                const isUploaded = url.startsWith('/uploads/');
                if (!isUploaded) return <SocialVideoEmbed key={`${url}-${index}`} url={url} className="rounded-2xl overflow-hidden" />;
                return (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    onClick={() => {
                      setActiveVideoIndex(index);
                      if (property.id) {
                        void createPublicMarketingEvent({
                          property_id: property.id,
                          event_type: 'video_view',
                          ad_source: adSource,
                          session_id: sessionId,
                          metadata: trackingMetadata,
                        });
                      }
                    }}
                    className="group relative h-72 overflow-hidden rounded-2xl border border-white/15 md:h-[460px]"
                  >
                    <video
                      className="h-full w-full object-contain bg-black transition duration-500 group-hover:scale-[1.01]"
                      muted
                      preload="metadata"
                      onEnded={() => {
                        if (!property.id) return;
                        void createPublicMarketingEvent({
                          property_id: property.id,
                          event_type: 'video_complete',
                          ad_source: adSource,
                          session_id: sessionId,
                          metadata: trackingMetadata,
                        });
                      }}
                    >
                      <source src={resolveMediaUrl(url)} />
                    </video>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <PlayCircle className="h-14 w-14 text-white" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-white/15 bg-slate-900/70 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.42)] backdrop-blur-xl">
          <h3 className="mb-4 text-2xl font-bold">إجراءات سريعة</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(ctaMode === 'whatsapp' || ctaMode === 'mixed') && whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  if (!property.id) return;
                  void createPublicMarketingEvent({
                    property_id: property.id,
                    event_type: 'cta_whatsapp_click',
                    ad_source: adSource,
                    session_id: sessionId,
                    metadata: trackingMetadata,
                  });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white"
              >
                <MessageCircle className="h-4 w-4" /> واتساب
              </a>
            ) : null}
            {(ctaMode === 'call' || ctaMode === 'mixed') && contactPhone ? (
              <a
                href={`tel:${contactPhone}`}
                onClick={() => {
                  if (!property.id) return;
                  void createPublicMarketingEvent({
                    property_id: property.id,
                    event_type: 'cta_call_click',
                    ad_source: adSource,
                    session_id: sessionId,
                    metadata: trackingMetadata,
                  });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-semibold"
              >
                <Phone className="h-4 w-4" /> اتصال
              </a>
            ) : null}
          </div>
        </section>

        {formEnabled && (ctaMode === 'inquiry' || ctaMode === 'mixed' || ctaMode === 'whatsapp' || ctaMode === 'call') && (
          <section className="rounded-3xl border border-white/15 bg-slate-900/70 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.42)] backdrop-blur-xl">
            <h3 className="mb-5 text-2xl font-bold">نموذج طلب العميل</h3>
            <Form
              form={leadForm}
              layout="vertical"
              style={{ color: '#e5e7eb' }}
              initialValues={{ request_type: 'general' }}
              onFinish={async (values) => {
                if (!property.id) return;
                setSubmitting(true);
                try {
                  await createPublicMarketingLead({
                    property_id: property.id,
                    name: values.name || '',
                    phone: values.phone || '',
                    notes: values.note || undefined,
                    request_type: values.request_type,
                    ad_source: adSource,
                    session_id: sessionId,
                    source_page: 'landing_page',
                    referrer: trackingMetadata.referrer,
                    landing_url: trackingMetadata.landing_url,
                    browser_name: trackingMetadata.browser,
                    device_type: trackingMetadata.device,
                  });
                  await createPublicMarketingEvent({
                    property_id: property.id,
                    event_type: 'form_submit',
                    ad_source: adSource,
                    session_id: sessionId,
                    metadata: { ...trackingMetadata, request_type: values.request_type },
                  });
                  const w = window as Window & {
                    __akareTrackEvent?: (name: string, payload?: Record<string, unknown>) => void;
                  };
                  w.__akareTrackEvent?.('landing_lead_submit', {
                    property_id: property.id,
                    request_type: values.request_type,
                  });
                  message.success('تم إرسال طلبك بنجاح.');
                  leadForm.resetFields();
                } catch (e: any) {
                  message.error(e?.response?.data?.detail || 'تعذر إرسال الطلب حالياً.');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Form.Item label={<span style={{ color: '#e2e8f0' }}>الاسم</span>} name="name" rules={[{ required: true, message: 'الاسم مطلوب.' }]}>
                  <Input
                    placeholder="اسم العميل"
                    style={{ background: 'rgba(255, 255, 255, 0.75)', borderColor: 'rgba(148, 163, 184, 0.35)', color: '#f8fafc' }}
                  />
                </Form.Item>
                <Form.Item label={<span style={{ color: '#e2e8f0' }}>رقم الجوال</span>} name="phone" rules={[{ required: true, message: 'رقم الجوال مطلوب.' }]}>
                  <Input
                    placeholder="05xxxxxxxx"
                    style={{ background: 'rgba(255, 255, 255, 0.75)', borderColor: 'rgba(148, 163, 184, 0.35)', color: '#f8fafc' }}
                  />
                </Form.Item>
                <Form.Item label={<span style={{ color: '#e2e8f0' }}>نوع الطلب</span>} name="request_type">
                  <Select
                    style={{ color: '#f8fafc' }}
                    options={[
                      { value: 'general', label: 'استفسار عام' },
                      { value: 'booking', label: 'طلب حجز' },
                    ]}
                  />
                </Form.Item>
                <Form.Item label={<span style={{ color: '#e2e8f0' }}>ملاحظات</span>} name="note">
                  <Input.TextArea
                    rows={4}
                    placeholder="اكتب أي تفاصيل إضافية..."
                    style={{ background: 'rgba(255, 255, 255, 0.75)', borderColor: 'rgba(148, 163, 184, 0.35)', color: '#f8fafc' }}
                  />
                </Form.Item>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-white disabled:opacity-60"
              >
                <MessageCircle className="h-4 w-4" />
                {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
              </button>
            </Form>
          </section>
        )}

        <section className="rounded-3xl border border-white/15 bg-slate-900/70 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.42)] backdrop-blur-xl">
          <h3 className="mb-4 text-2xl font-bold">معلومات المكتب</h3>
          <div className="grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
            {company?.logo_url ? <Avatar src={resolveMediaUrl(company.logo_url)} size={72} /> : <div className="h-[72px] w-[72px] rounded-full bg-white/10" />}
            <div>
              <p className="text-xl font-semibold">{company?.company_name || 'مكتب عقاري'}</p>
              <p className="mt-1 text-slate-300">{hasText(company?.official_email) ? company?.official_email : 'تفاصيل المكتب متاحة عند التواصل.'}</p>
            </div>
            {property.owner_id ? (
              <button
                type="button"
                onClick={() => navigate(`/share/company/${property.owner_id}`)}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold"
              >
                عرض كل العقارات
              </button>
            ) : null}
          </div>
        </section>

        {similarProperties.length > 0 && (
          <section>
            <h3 className="mb-4 text-2xl font-bold">عقارات مشابهة</h3>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {similarProperties.slice(0, 3).map((item, index) => (
                <PublicPropertyCard
                  key={item.id || item.raw_text}
                  property={item}
                  index={index}
                  onOpen={() => item.id && navigate(`/ad/${item.id}`)}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <Modal
        open={activeVideoIndex !== null}
        footer={null}
        centered
        onCancel={() => setActiveVideoIndex(null)}
        width="96%"
        style={{ maxWidth: 1200 }}
        bodyStyle={{ padding: 0 }}
      >
        {activeVideoIndex !== null ? (
          <video controls autoPlay playsInline className="block max-h-[86vh] w-full rounded-lg bg-black object-contain">
            <source src={resolveMediaUrl(property.videos![activeVideoIndex])} />
          </video>
        ) : null}
      </Modal>

      {whatsappHref && (
        <div className="sticky bottom-0 z-20 border-t border-white/10 bg-gradient-to-r from-[#0b1220]/95 to-[#111827]/95 p-3 backdrop-blur-xl md:hidden">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" />
            تواصل الآن عبر واتساب
          </a>
        </div>
      )}
    </div>
  );
};

export default PublicPropertyLandingPage;
