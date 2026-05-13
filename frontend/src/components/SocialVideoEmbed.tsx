import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Spin, Typography } from 'antd';
import { resolvePublicVideoUrl } from '../services/api';

const { Text, Paragraph } = Typography;

const normalizeExternalHref = (value?: string | null): string | null => {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text.replace(/^\/+/, '')}`;
};

export type SocialVideoParseResult =
  | { kind: 'youtube'; href: string; embedSrc: string; label: string }
  | { kind: 'tiktok'; href: string; embedSrc: string; videoId: string; label: string }
  | { kind: 'instagram'; href: string; embedSrc: string; label: string }
  | { kind: 'unsupported'; href: string; label: string };

/** TikTok video IDs are long numeric strings (typically 15–20 digits). */
function extractTikTokVideoId(href: string, pathname: string): string | undefined {
  const m1 = pathname.match(/\/video\/(\d+)/);
  if (m1?.[1]) return m1[1];
  const m2 = href.match(/\/video\/(\d+)/);
  if (m2?.[1]) return m2[1];
  const m3 = pathname.match(/(\d{15,22})/);
  if (m3?.[1]) return m3[1];
  return undefined;
}

function tiktokUrlNeedsServerResolve(href: string): boolean {
  const normalized = normalizeExternalHref(href) || href.trim();
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (!host.includes('tiktok.com')) return false;
    const videoId = extractTikTokVideoId(normalized, parsed.pathname);
    return !videoId;
  } catch {
    return false;
  }
}

export function parseSocialVideoUrl(value: string): SocialVideoParseResult {
  const href = normalizeExternalHref(value) || value.trim();
  try {
    const parsed = new URL(href);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      if (id) {
        return {
          kind: 'youtube',
          href,
          embedSrc: `https://www.youtube.com/embed/${id}`,
          label: 'YouTube',
        };
      }
    }

    if (host.includes('youtube.com') || host === 'm.youtube.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const id =
        parsed.searchParams.get('v') ||
        (['shorts', 'embed'].includes(parts[0] ?? '') ? parts[1] : undefined);
      if (id) {
        return {
          kind: 'youtube',
          href,
          embedSrc: `https://www.youtube.com/embed/${id}`,
          label: 'YouTube',
        };
      }
    }

    if (host.includes('tiktok.com') || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
      const videoId = extractTikTokVideoId(href, parsed.pathname);
      if (videoId) {
        return {
          kind: 'tiktok',
          href,
          videoId,
          embedSrc: `https://www.tiktok.com/embed/v2/${videoId}`,
          label: 'TikTok',
        };
      }
    }

    if (host.includes('instagram.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const head = parts[0] ?? '';
      const type =
        head === 'reels' ? 'reel' : ['reel', 'p', 'tv'].includes(head) ? head : 'reel';
      const id = ['reel', 'reels', 'p', 'tv'].includes(head) ? parts[1] : undefined;
      if (id) {
        return {
          kind: 'instagram',
          href,
          embedSrc: `https://www.instagram.com/${type}/${id}/embed`,
          label: 'Instagram',
        };
      }
    }
  } catch {
    /* invalid URL */
  }

  return { kind: 'unsupported', href, label: 'فيديو' };
}

const responsiveIframeBox: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  paddingTop: '56.25%',
  background: '#000',
};

const responsiveIframe: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 0,
  display: 'block',
};

export interface SocialVideoEmbedProps {
  url: string;
  className?: string;
}

/**
 * Embedded players for YouTube, TikTok (official embed iframe v2), and Instagram Reels.
 * Unsupported URLs render as a safe external link fallback.
 */
const SocialVideoEmbed: React.FC<SocialVideoEmbedProps> = ({ url, className }) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveFailed, setResolveFailed] = useState(false);

  useEffect(() => {
    setResolvedUrl(null);
    setResolveFailed(false);
    if (!tiktokUrlNeedsServerResolve(url)) return;

    let cancelled = false;
    (async () => {
      setResolving(true);
      try {
        const final = await resolvePublicVideoUrl(url);
        if (!cancelled) setResolvedUrl(final);
      } catch {
        if (!cancelled) setResolveFailed(true);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const parsed = useMemo(() => parseSocialVideoUrl(resolvedUrl || url), [url, resolvedUrl]);

  const header = (
    <div style={{ padding: '8px 12px', fontWeight: 700, color: '#2f4d37' }}>{parsed.label}</div>
  );

  if (parsed.kind === 'youtube') {
    return (
      <div className={className} style={{ border: '1px solid #e4e7df', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        {header}
        <div style={{ ...responsiveIframeBox, borderRadius: '0 0 12px 12px' }}>
          <iframe
            src={parsed.embedSrc}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            style={responsiveIframe}
          />
        </div>
      </div>
    );
  }

  if (parsed.kind === 'instagram') {
    return (
      <div className={className} style={{ border: '1px solid #e4e7df', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        {header}
        <div style={{ ...responsiveIframeBox, borderRadius: '0 0 12px 12px' }}>
          <iframe
            src={parsed.embedSrc}
            title="Instagram embed"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            style={responsiveIframe}
          />
        </div>
      </div>
    );
  }

  if (parsed.kind === 'tiktok') {
    return (
      <div className={className} style={{ border: '1px solid #e4e7df', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        {header}
        <div style={{ ...responsiveIframeBox, minHeight: 480, borderRadius: '0 0 12px 12px' }}>
          <iframe
            src={parsed.embedSrc}
            title="TikTok embed"
            allow="encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            style={responsiveIframe}
          />
        </div>
      </div>
    );
  }

  if (tiktokUrlNeedsServerResolve(url) && resolving && !resolvedUrl) {
    return (
      <Card className={className} size="small" style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Spin />
          <Text type="secondary">جارٍ تجهيز الفيديو…</Text>
        </div>
      </Card>
    );
  }

  return (
    <Card className={className} size="small" style={{ borderRadius: 12 }}>
      <Text strong>{parsed.label}</Text>
      {resolveFailed ? (
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          تعذر فتح الفيديو داخل الصفحة. يمكنك فتحه على TikTok.
        </Paragraph>
      ) : null}
      <Paragraph ellipsis={{ rows: 2 }} style={{ marginTop: 8 }}>
        {parsed.href}
      </Paragraph>
      <Button href={parsed.href} target="_blank" rel="noopener noreferrer">
        فتح الرابط
      </Button>
    </Card>
  );
};

export default SocialVideoEmbed;
