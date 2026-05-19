import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Avatar, Input, Select, Skeleton, Spin, message } from 'antd';
import { motion } from 'framer-motion';
import { Building2, MessageCircle, Search, SlidersHorizontal, Trophy } from 'lucide-react';
import type { Property, PublicCompany } from '../services/api';
import { getPublicCompany, getPublicCompanyProperties, publicCompanyAiSearch, resolveMediaUrl } from '../services/api';
import PublicPropertyCard from './public/PublicPropertyCard';

const CompanyPublicPropertiesPage: React.FC = () => {
  const { ownerId } = useParams<{ ownerId: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [aiResults, setAiResults] = useState<Property[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('all');
  const [type, setType] = useState('all');
  const [priceRange, setPriceRange] = useState('all');
  const [areaRange, setAreaRange] = useState('all');
  const [sortBy, setSortBy] = useState('latest');

  useEffect(() => {
    const fetchData = async () => {
      if (!ownerId) {
        setError('لم يتم تحديد المكتب العقاري.');
        setLoading(false);
        return;
      }
      try {
        const [companyData, props] = await Promise.all([
          getPublicCompany(ownerId),
          getPublicCompanyProperties(ownerId),
        ]);
        setCompany(companyData);
        setAllProperties(props);
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'فشل في تحميل بيانات المكتب العقاري.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [ownerId]);

  const sourceProperties = aiResults ?? allProperties;
  const cityOptions = useMemo(
    () => Array.from(new Set(allProperties.map((p) => p.city).filter(Boolean))),
    [allProperties],
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(allProperties.map((p) => p.property_type).filter(Boolean))),
    [allProperties],
  );

  const filteredProperties = useMemo(() => {
    const matchesRange = (value: number, selected: string): boolean => {
      if (selected === 'all') return true;
      if (selected === '0-500000') return value >= 0 && value <= 500000;
      if (selected === '500000-1000000') return value > 500000 && value <= 1000000;
      if (selected === '1000000+') return value > 1000000;
      if (selected === '0-200') return value >= 0 && value <= 200;
      if (selected === '200-400') return value > 200 && value <= 400;
      if (selected === '400+') return value > 400;
      return true;
    };

    let items = sourceProperties.filter((property) => {
      const q = query.trim().toLowerCase();
      const text = [
        property.city,
        property.neighborhood,
        property.property_type,
        property.details,
        property.formatted_description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const queryMatch = !q || text.includes(q);
      const cityMatch = city === 'all' || property.city === city;
      const typeMatch = type === 'all' || property.property_type === type;
      const priceMatch = matchesRange(property.price || 0, priceRange);
      const areaMatch = matchesRange(property.area || 0, areaRange);
      return queryMatch && cityMatch && typeMatch && priceMatch && areaMatch;
    });

    items = items.sort((a, b) => {
      if (sortBy === 'price-high') return (b.price || 0) - (a.price || 0);
      if (sortBy === 'price-low') return (a.price || 0) - (b.price || 0);
      if (sortBy === 'area-high') return (b.area || 0) - (a.area || 0);
      return 0;
    });

    return items;
  }, [areaRange, city, priceRange, query, sortBy, sourceProperties, type]);

  const companyPhoneDigits = (company?.contact_phone || '').replace(/[^\d]/g, '');
  const companyPageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const whatsappCompanyText = encodeURIComponent(
    `أود الاستفسار عن عقارات المكتب ${company?.company_name || ''}.\n${companyPageUrl}`,
  );
  const whatsappCompanyHref = companyPhoneDigits
    ? `https://wa.me/${companyPhoneDigits}?text=${whatsappCompanyText}`
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <Skeleton.Image active className="!h-80 !w-full !rounded-3xl" />
          <Skeleton active paragraph={{ rows: 8 }} className="rounded-3xl bg-white p-8" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <Alert type="error" message={error} />
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen text-slate-100"
      style={{
        background:
          'radial-gradient(1150px 480px at 8% -10%, rgba(34,197,94,0.17), transparent 55%), radial-gradient(850px 430px at 93% 0%, rgba(56,189,248,0.17), transparent 58%), linear-gradient(160deg, #0f172a 0%, #172554 48%, #0b1220 100%)',
      }}
    >
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1327] via-[#13213a] to-[#1b2a45]" />
        <div className="absolute -top-32 -left-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-32 right-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-10 md:py-16">
          <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-xl"
            >
              رجوع
            </button>
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs backdrop-blur-xl">
              عقاري
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="rounded-3xl border border-white/20 bg-slate-900/68 p-6 shadow-[0_22px_50px_rgba(2,6,23,0.45)] backdrop-blur-2xl md:p-10"
          >
            <div className="grid gap-8 md:grid-cols-[auto_1fr]">
              <div className="mx-auto md:mx-0">
                {company?.logo_url ? (
                  <Avatar src={resolveMediaUrl(company.logo_url)} size={90} />
                ) : (
                  <div className="flex h-[90px] w-[90px] items-center justify-center rounded-full bg-white/20">
                    <Building2 className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-3xl font-bold md:text-5xl">{company?.company_name || 'مكتب عقاري'}</h1>
                <p className="mt-4 max-w-3xl text-slate-200">
                  صفحة عروض عقارية مصممة بتجربة بصرية فاخرة وسلسة، لتسهيل اكتشاف العقار المناسب بسرعة وثقة.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 text-sm">
                  <span className="rounded-full bg-white/15 px-4 py-2">عدد العقارات: {allProperties.length}</span>
                  <span className="rounded-full bg-white/15 px-4 py-2">عملاء متوقعون: {(allProperties.length * 14).toLocaleString('ar-SA')}</span>
                  <span className="rounded-full bg-white/15 px-4 py-2">سنوات الخبرة: +10</span>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  {whatsappCompanyHref && (
                    <a
                      href={whatsappCompanyHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                      مراسلة المكتب واتساب
                    </a>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10">
        <section className="rounded-3xl border border-white/15 bg-slate-900/72 p-5 shadow-[0_20px_45px_rgba(2,6,23,0.45)] backdrop-blur-xl md:p-6">
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <SlidersHorizontal className="h-5 w-5 text-emerald-300" />
            بحث وفلاتر متقدمة
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input
              allowClear
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onPressEnter={async (e) => {
                const value = (e.currentTarget as HTMLInputElement).value.trim();
                if (!ownerId || !value) {
                  setAiResults(null);
                  return;
                }
                setSearchLoading(true);
                try {
                  const results = await publicCompanyAiSearch(ownerId, value);
                  setAiResults(results);
                } catch (errorResult: any) {
                  message.error(errorResult?.response?.data?.detail || 'فشل بحث الذكاء الاصطناعي، سيتم استخدام البحث المحلي.');
                  setAiResults(null);
                } finally {
                  setSearchLoading(false);
                }
              }}
              prefix={searchLoading ? <Spin size="small" /> : <Search className="h-4 w-4 text-slate-500" />}
              placeholder="ابحث عن مدينة، حي، نوع..."
              className="!rounded-xl"
            />
            <Select value={city} onChange={setCity} options={[{ value: 'all', label: 'كل المدن' }, ...cityOptions.map((value) => ({ value, label: value }))]} />
            <Select value={type} onChange={setType} options={[{ value: 'all', label: 'كل الأنواع' }, ...typeOptions.map((value) => ({ value, label: value }))]} />
            <Select
              value={priceRange}
              onChange={setPriceRange}
              options={[
                { value: 'all', label: 'كل الأسعار' },
                { value: '0-500000', label: 'حتى 500 ألف' },
                { value: '500000-1000000', label: '500 ألف - 1 مليون' },
                { value: '1000000+', label: 'أكثر من 1 مليون' },
              ]}
            />
            <Select
              value={areaRange}
              onChange={setAreaRange}
              options={[
                { value: 'all', label: 'كل المساحات' },
                { value: '0-200', label: 'حتى 200م²' },
                { value: '200-400', label: '200م² - 400م²' },
                { value: '400+', label: 'أكبر من 400م²' },
              ]}
            />
            <Select
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'latest', label: 'الأحدث' },
                { value: 'price-high', label: 'السعر: الأعلى' },
                { value: 'price-low', label: 'السعر: الأقل' },
                { value: 'area-high', label: 'المساحة: الأكبر' },
              ]}
            />
          </div>
        </section>

        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold md:text-3xl">العقارات المتاحة</h2>
            <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm">
              {filteredProperties.length.toLocaleString('ar-SA')} نتيجة
            </div>
          </div>

          {filteredProperties.length === 0 ? (
            <Alert type="info" message="لا توجد نتائج مطابقة للفلاتر الحالية." />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProperties.map((property, index) => {
                const key = property.id || property.raw_text;
                const isFavorite = favorites[key] || false;
                return (
                  <PublicPropertyCard
                    key={key}
                    property={property}
                    index={index}
                    showFavorite
                    isFavorite={isFavorite}
                    onToggleFavorite={() =>
                      setFavorites((prev) => ({
                        ...prev,
                        [key]: !prev[key],
                      }))
                    }
                    onOpen={() => {
                      if (property.id) navigate(`/share/${property.id}`);
                    }}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/15 bg-slate-900/72 p-6 shadow-[0_20px_45px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Trophy className="h-5 w-5 text-amber-300" />
            تجربة تصفح عالمية
          </div>
          <p className="mt-3 leading-8 text-slate-300">
          </p>
        </section>
      </main>
    </div>
  );
};

export default CompanyPublicPropertiesPage;


