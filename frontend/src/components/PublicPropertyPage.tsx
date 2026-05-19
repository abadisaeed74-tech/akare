import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Avatar, Button, Image, Modal, Skeleton, Tag, message } from 'antd';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Building2,
  Eye,
  MapPin,
  MessageCircle,
  Phone,
  PlayCircle,
  Share2,
  WalletCards,
} from 'lucide-react';
import type { Property, PublicCompany } from '../services/api';
import {
  getPublicCompany,
  getPublicCompanyProperties,
  getPublicProperty,
  resolveMediaUrl,
} from '../services/api';

import SocialVideoEmbed from './SocialVideoEmbed';
import PublicPropertyCard from './public/PublicPropertyCard';
import { Button as UiButton } from './ui/button';
import { Card, CardContent } from './ui/card';

const normalizeExternalHref = (value?: string | null): string | null => {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text.replace(/^\/+/, '')}`;
};

const hasMeaningfulText = (value?: string | null): boolean => {
  if (!value) return false;
  const text = value.trim();
  return text !== '' && text !== 'غير مذكور';
};

const getMapEmbedUrl = (rawMapUrl?: string | null): string | null => {
  const href = normalizeExternalHref(rawMapUrl);
  if (!href) return null;
  if (href.includes('/maps/embed')) return href;
  return `https://www.google.com/maps?q=${encodeURIComponent(href)}&output=embed`;
};

const getContactPhone = (company: PublicCompany | null, property: Property | null): string | null => {
  const number = company?.contact_phone || property?.marketer_contact_number || property?.owner_contact_number;
  if (!number) return null;
  return number.replace(/\s+/g, '');
};

const PublicPropertyPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [similarProperties, setSimilarProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setError('لم يتم تحديد العقار.');
        setLoading(false);
        return;
      }

      try {
        const data = await getPublicProperty(id);
        setProperty(data);

        if (data.owner_id) {
          const [companyResult, officeProperties] = await Promise.allSettled([
            getPublicCompany(data.owner_id),
            getPublicCompanyProperties(data.owner_id),
          ]);

          if (companyResult.status === 'fulfilled') {
            setCompany(companyResult.value);
          }
          if (officeProperties.status === 'fulfilled') {
            setSimilarProperties(
              officeProperties.value.filter((item) => item.id && item.id !== data.id).slice(0, 6),
            );
          }
        }
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'فشل في تحميل بيانات العقار.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const galleryItems = useMemo(
    () => (property?.images || []).map((url) => resolveMediaUrl(url)).filter(Boolean),
    [property?.images],
  );
  const coverImage = galleryItems[0];
  const mapHref = normalizeExternalHref(property?.map_url);
  const mapEmbed = getMapEmbedUrl(property?.map_url);
  const contactPhone = getContactPhone(company, property);
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const whatsappText = encodeURIComponent(
    `أود الاستفسار عن هذا العقار.\n${property?.property_type || 'عقار'}${property?.city ? ` - ${property.city}` : ''}\n${shareUrl}`,
  );
  const whatsappHref = contactPhone
    ? `https://wa.me/${contactPhone.replace(/[^\d]/g, '')}?text=${whatsappText}`
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton.Image active className="!h-72 !w-full !rounded-3xl" />
          <Skeleton active paragraph={{ rows: 10 }} className="rounded-3xl bg-white p-8" />
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <Alert type="error" message={error || 'العقار غير موجود.'} />
      </div>
    );
  }

  const priceLabel =
    property.price && property.price > 0
      ? property.price.toLocaleString('ar-SA', { style: 'currency', currency: 'SAR' })
      : 'السعر عند التواصل';
  const locationLabel = [property.neighborhood, property.city].filter(hasMeaningfulText).join('، ');
  const featureItems = [
    { label: 'نوع العقار', value: property.property_type || 'غير مذكور', icon: <Building2 className="h-4 w-4" /> },
    { label: 'المدينة', value: property.city || 'غير مذكور', icon: <MapPin className="h-4 w-4" /> },
    {
      label: 'المساحة',
      value: property.area ? `${property.area.toLocaleString('ar-SA')} م²` : 'غير مذكور',
      icon: <WalletCards className="h-4 w-4" />,
    },
    { label: 'المشاهدات', value: `${(property.view_count || 0).toLocaleString('ar-SA')}`, icon: <Eye className="h-4 w-4" /> },
  ];

  return (
    <div
      dir="rtl"
      className="min-h-screen text-slate-100"
      style={{
        background:
          'radial-gradient(1100px 480px at 6% -8%, rgba(34,197,94,0.18), transparent 55%), radial-gradient(850px 420px at 94% 0%, rgba(56,189,248,0.18), transparent 58%), linear-gradient(160deg, #0f172a 0%, #172554 48%, #0b1220 100%)',
      }}
    >
      <section className="relative min-h-[34vh] overflow-hidden md:min-h-[40vh]">
        {coverImage ? (
          <img
            src={coverImage}
            alt={property.property_type || 'صورة العقار'}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/55 via-[#0f172a]/45 to-[#0b1220]/65" />

        <header className="sticky top-0 z-20">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-4">
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
                <p className="text-xs text-slate-200/80">عرض عقاري فاخر</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 backdrop-blur-xl">
              <button
                type="button"
                onClick={async () => {
                  const shareUrl = window.location.href;
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    message.success('تم نسخ رابط العقار.');
                  } catch {
                    message.info('تعذر نسخ الرابط الآن.');
                  }
                }}
                className="rounded-xl p-2 text-white transition hover:bg-white/15"
                aria-label="مشاركة العقار"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="rounded-xl border border-white/25 px-3 py-1.5 text-sm text-white hover:bg-white/15"
              >
                رجوع
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-8 pb-6 md:pt-10 md:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="max-w-3xl"
          >
            <Tag className="!mb-4 !rounded-full !border-none !bg-white/20 !px-4 !py-1 !text-white backdrop-blur-md">
              عرض مميز
            </Tag>
            <h1 className="text-2xl font-bold leading-tight md:text-4xl">
              {property.property_type || 'عقار فاخر'} {property.city ? `في ${property.city}` : ''}
            </h1>
            {locationLabel && <p className="mt-4 text-lg text-slate-200">{locationLabel}</p>}
            <p className="mt-3 text-xl font-bold text-emerald-300 md:text-3xl">{priceLabel}</p>
          </motion.div>

          <div className="flex flex-wrap gap-3">
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                <UiButton variant="premium" size="lg" className="rounded-2xl">
                  <MessageCircle className="h-5 w-5" />
                  مراسلة المكتب واتساب
                </UiButton>
              </a>
            )}
            {contactPhone && (
              <a href={`tel:${contactPhone}`}>
                <UiButton variant="ghost" size="lg" className="rounded-2xl">
                  <Phone className="h-5 w-5" />
                  اتصال مباشر
                </UiButton>
              </a>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <Card className="border border-white/15 bg-slate-900/72 p-0 shadow-[0_22px_50px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold md:text-3xl">معرض الصور</h2>
            <Tag className="!rounded-full !border-none !bg-white/10 !text-white">
              {galleryItems.length.toLocaleString('ar-SA')} صورة
            </Tag>
          </div>

          {galleryItems.length === 0 ? (
            <Alert type="info" message="لا توجد صور مرفقة لهذا العقار." />
          ) : (
            <Image.PreviewGroup items={galleryItems}>
              <div className="grid gap-3 md:grid-cols-4">
                {galleryItems.slice(0, 5).map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className={`overflow-hidden rounded-2xl ${index === 0 ? 'h-56 md:col-span-2 md:h-80' : 'h-36 md:h-40'}`}
                  >
                    <Image
                      src={url}
                      alt={`صورة العقار ${index + 1}`}
                      loading="lazy"
                      className="!h-full !w-full object-cover"
                      placeholder={<Skeleton.Image active className="!h-full !w-full" />}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {galleryItems.map((url, index) => (
                  <div key={`${url}-thumb-${index}`} className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10">
                    <Image src={url} alt={`معاينة ${index + 1}`} loading="lazy" className="!h-full !w-full object-cover" />
                  </div>
                ))}
              </div>
            </Image.PreviewGroup>
          )}
          </CardContent>
        </Card>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {featureItems.map((item) => (
            <motion.div
              key={item.label}
              whileHover={{ y: -4 }}
              className="rounded-2xl border border-white/15 bg-slate-900/72 p-5 backdrop-blur-lg"
            >
              <div className="mb-3 inline-flex rounded-xl bg-emerald-500/20 p-2 text-emerald-300">{item.icon}</div>
              <p className="text-sm text-slate-300">{item.label}</p>
              <p className="mt-1 text-lg font-semibold">{item.value}</p>
            </motion.div>
          ))}
        </section>

        <section className="rounded-3xl border border-white/15 bg-slate-900/72 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <h3 className="mb-4 text-2xl font-bold">الوصف والتفاصيل</h3>
          <p className="leading-8 text-slate-200">
            {property.formatted_description || property.details || 'لا توجد تفاصيل إضافية حالياً لهذا العقار.'}
          </p>
        </section>

        {property.videos && property.videos.length > 0 && (
          <section className="rounded-3xl border border-white/15 bg-slate-900/72 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.45)] backdrop-blur-xl">
            <h3 className="mb-5 text-2xl font-bold">جولة فيديو سينمائية</h3>
            <div className="grid gap-5">
              {property.videos.map((url, index) => {
                const isUploadedVideo = url.startsWith('/uploads/');
                if (!isUploadedVideo) {
                  return <SocialVideoEmbed key={url + index} url={url} className="overflow-hidden rounded-2xl" />;
                }
                return (
                  <button
                    type="button"
                    key={url + index}
                    onClick={() => setActiveVideoIndex(index)}
                    className="group relative h-72 overflow-hidden rounded-2xl border border-white/10 md:h-[460px]"
                  >
                    <video className="h-full w-full object-contain bg-black transition duration-700 group-hover:scale-[1.01]" muted preload="metadata">
                      <source src={resolveMediaUrl(url)} />
                    </video>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <PlayCircle className="h-14 w-14 text-white drop-shadow-xl" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {mapHref && (
          <section className="rounded-3xl border border-white/15 bg-slate-900/72 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.45)] backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-2xl font-bold">الموقع على الخريطة</h3>
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20"
              >
                فتح Google Maps
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
            {mapEmbed ? (
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <iframe title="خريطة العقار" src={mapEmbed} className="h-80 w-full border-0" loading="lazy" />
              </div>
            ) : (
              <Alert type="info" message="تعذر عرض الخريطة المضمنة، استخدم زر Google Maps." />
            )}
          </section>
        )}

        <section className="rounded-3xl border border-white/15 bg-slate-900/72 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <h3 className="mb-4 text-2xl font-bold">المكتب العقاري</h3>
          <div className="grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
            {company?.logo_url ? (
              <Avatar src={resolveMediaUrl(company.logo_url)} size={72} />
            ) : (
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/10">
                <Building2 className="h-8 w-8" />
              </div>
            )}
            <div>
              <h4 className="text-xl font-semibold">{company?.company_name || 'مكتب عقاري'}</h4>
              <p className="mt-1 text-slate-300">{company?.official_email || 'بيانات المكتب ستظهر هنا.'}</p>
              <p className="mt-1 text-slate-300">عدد العروض: {similarProperties.length + 1}</p>
            </div>
            {property.owner_id && (
              <Button type="primary" onClick={() => navigate(`/share/company/${property.owner_id}`)}>
                عرض جميع عقارات المكتب
              </Button>
            )}
          </div>
        </section>

        {similarProperties.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold">عقارات مشابهة</h3>
              
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {similarProperties.slice(0, 3).map((item, index) => (
                <PublicPropertyCard
                  key={item.id || item.raw_text}
                  property={item}
                  index={index}
                  onOpen={() => item.id && navigate(`/share/${item.id}`)}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {whatsappHref && (
        <div className="sticky bottom-0 z-20 border-t border-white/10 bg-gradient-to-r from-[#0b1220]/95 to-[#111827]/95 p-3 backdrop-blur-xl md:hidden">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2">
            {contactPhone ? (
              <a
                href={`tel:${contactPhone}`}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-semibold text-white"
              >
                <Phone className="h-4 w-4" />
                اتصال
              </a>
            ) : null}
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" />
              مراسلة المكتب عبر واتساب
            </a>
          </div>
        </div>
      )}

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

    </div>
  );
};

export default PublicPropertyPage;
