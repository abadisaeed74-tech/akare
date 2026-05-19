import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  BedDouble,
  Building2,
  LandPlot,
  MapPin,
  Ruler,
  Sparkles,
} from 'lucide-react';
import type { Property } from '../../services/api';
import { resolveMediaUrl } from '../../services/api';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface PublicPropertyCardProps {
  property: Property;
  index?: number;
  onOpen?: () => void;
  showFavorite?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

const hasMeaningfulText = (value?: string | null): boolean => {
  if (!value) return false;
  const normalized = value.trim();
  return normalized !== '' && normalized !== 'غير مذكور';
};

const PublicPropertyCard: React.FC<PublicPropertyCardProps> = ({
  property,
  index = 0,
  onOpen,
  showFavorite = false,
  isFavorite = false,
  onToggleFavorite,
}) => {
  const primaryImage = useMemo(
    () => (property.images && property.images.length > 0 ? resolveMediaUrl(property.images[0]) : ''),
    [property.images],
  );

  const title = `${property.property_type || 'عقار'}${hasMeaningfulText(property.neighborhood) ? ` في ${property.neighborhood}` : ''}`;
  const city = hasMeaningfulText(property.city) ? property.city : 'مدينة غير مذكورة';
  const areaLabel =
    typeof property.area === 'number' && property.area > 0
      ? `${property.area.toLocaleString('ar-SA')} م²`
      : 'غير مذكور';
  const priceLabel =
    typeof property.price === 'number' && property.price > 0
      ? property.price.toLocaleString('ar-SA', { style: 'currency', currency: 'SAR' })
      : 'السعر عند التواصل';

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.06, 0.35), ease: 'easeOut' }}
      viewport={{ once: true, margin: '-50px' }}
      whileHover={{ y: -5 }}
      className="group"
    >
      <Card className="relative overflow-hidden border-white/30 bg-white/70 shadow-[0_20px_60px_rgba(16,24,40,0.12)]">
      <div className="relative h-56 overflow-hidden">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-100 text-slate-500">
            <Building2 className="h-8 w-8" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
            {property.property_type || 'عقار'}
          </span>
          {showFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              className={`rounded-full border p-2 backdrop-blur-md transition ${
                isFavorite
                  ? 'border-rose-300 bg-rose-500/90 text-white'
                  : 'border-white/30 bg-white/20 text-white hover:bg-white/35'
              }`}
              aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="absolute bottom-4 right-4 left-4 text-white">
          <p className="text-2xl font-bold drop-shadow-sm">{priceLabel}</p>
        </div>
      </div>

      <CardContent className="space-y-4 p-5">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
            <MapPin className="h-4 w-4" />
            {city}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 px-3 py-2">
            <Ruler className="h-4 w-4" />
            <span>{areaLabel}</span>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 px-3 py-2">
            <LandPlot className="h-4 w-4" />
            <span>{hasMeaningfulText(property.neighborhood) ? property.neighborhood : 'حي غير مذكور'}</span>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 px-3 py-2">
            <Building2 className="h-4 w-4" />
            <span>{property.property_code || 'بدون رمز'}</span>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 px-3 py-2">
            <BedDouble className="h-4 w-4" />
            <span>{property.details ? 'تفاصيل متاحة' : 'تفاصيل محدودة'}</span>
          </div>
        </div>

        <Button type="button" variant="default" size="lg" onClick={onOpen} className="w-full rounded-2xl">
          معاينة التفاصيل
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </CardContent>
      </Card>
    </motion.div>
  );
};

export default PublicPropertyCard;
