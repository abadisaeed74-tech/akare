import React from 'react';
import { Button, Card, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  DatabaseOutlined,
  GlobalOutlined,
  LockOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  AppstoreOutlined,
  EyeOutlined,
  PhoneOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const featureCards = [
  {
    icon: ThunderboltOutlined,
    title: 'تحليل ذكي بالعربية',
    desc: 'اكتب وصفك بأي أسلوب، والنظام يحوّله تلقائيًا إلى عرض عقاري منظم.',
  },
  {
    icon: GlobalOutlined,
    title: 'موقع خاص لمكتبك',
    desc: 'صفحة عامة احترافية لمكتبك مع مشاركة الروابط للعملاء بسهولة.',
  },
  {
    icon: LockOutlined,
    title: 'إدارة فريق بصلاحيات',
    desc: 'أنشئ حسابات للموظفين وحدد صلاحيات التعديل والحذف والمشاهدة.',
  },
  {
    icon: DatabaseOutlined,
    title: 'ملفات وسائط متكاملة',
    desc: 'ارفع صور وفيديو وملفات وموقع العقار ضمن بطاقة واحدة جاهزة للعرض.',
  },
];

const navItems = [
  { href: '#features', label: 'المميزات', icon: <AppstoreOutlined /> },
  { href: '#preview', label: 'عرض الشاشة', icon: <EyeOutlined /> },
  { href: '#contact', label: 'تواصل معنا', icon: <PhoneOutlined /> },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const palette = {
    pageBg:
      'linear-gradient(145deg, #eef1ec 0%, #f4f5f2 52%, #ecefe8 100%)',
    navBg: '#ffffffcc',
    navBorder: '1px solid #edf2ff',
    navBrand: '#0f172a',
    navText: '#334155',
    chipBg: 'rgba(255,255,255,0.55)',
    chipBorder: '1px solid rgba(148, 163, 184, 0.32)',
    heroBg: 'linear-gradient(140deg, #fbfdf9 0%, #f2f7ef 100%)',
    heroBorder: '1px solid #e7eefc',
    heroTitle: '#0f172a',
    heroBody: '#334155',
    surface: '#ffffff',
    surfaceSoft: '#ffffffcc',
    surfaceBorder: '1px solid #edf2ff',
    text: '#0f172a',
    textMuted: '#475569',
  };
  const iconAccent = '#3f7d3c';

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '20px 14px 36px',
        direction: 'rtl',
        background: palette.pageBg,
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <Card
          bordered={false}
          style={{
            borderRadius: 16,
            marginBottom: 16,
            boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
            border: palette.navBorder,
            background: palette.navBg,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          bodyStyle={{ padding: '10px 16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text strong style={{ fontSize: 20, color: palette.navBrand }}>عقاري</Text>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    color: palette.navText,
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 999,
                    padding: '6px 12px',
                    border: palette.chipBorder,
                    background: palette.chipBg,
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    boxShadow: '0 6px 14px rgba(15,23,42,0.08)',
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      background: 'linear-gradient(145deg, rgba(30,58,138,0.15), rgba(56,189,248,0.14))',
                      color: iconAccent,
                      fontSize: 12,
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => navigate('/auth?mode=login')}>تسجيل دخول</Button>
              <Button type="primary" onClick={() => navigate('/auth?mode=register')}>
                إنشاء حساب
              </Button>
            </div>
          </div>
        </Card>

        <div
          style={{
            borderRadius: 26,
            padding: '28px 22px',
            background: palette.heroBg,
            color: palette.heroTitle,
            boxShadow: '0 20px 54px rgba(15,23,42,0.08)',
            border: palette.heroBorder,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Tag color="blue" style={{ borderRadius: 999, marginBottom: 14 }}>
              منصة عقارية ذكية للمكاتب والشركات
            </Tag>
            <Title level={1} style={{ color: palette.heroTitle, margin: 0, lineHeight: 1.35 }}>
              أدر عقارات مكتبك بذكاء
              <br />
              اكتب الوصف والباقي علينا
            </Title>
            <Paragraph style={{ color: palette.heroBody, marginTop: 2, marginBottom: 6, fontSize: 17, lineHeight: 1.9 }}>
              منصة احترافية للمكاتب والشركات العقارية: إدخال سريع، تحليل ذكي بالعربية،
              ومشاركة عروض جاهزة خلال ثواني.
            </Paragraph>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              <Tag style={{ borderRadius: 999, padding: '5px 12px', marginInlineEnd: 0 }}>واجهة احترافية</Tag>
              <Tag style={{ borderRadius: 999, padding: '5px 12px', marginInlineEnd: 0 }}>تحليل ذكي بالعربية</Tag>
              <Tag style={{ borderRadius: 999, padding: '5px 12px', marginInlineEnd: 0 }}>مشاركة فورية</Tag>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
              <Button
                type="primary"
                size="large"
                icon={<RocketOutlined />}
                onClick={() => navigate('/auth?mode=register')}
                style={{ minWidth: 235, fontWeight: 700, height: 48, background: '#3f7d3c' }}
              >
                ابدأ تجربتك الآن / إنشاء حساب
              </Button>
              <Button
                size="large"
                onClick={() => navigate('/auth?mode=login')}
                style={{ minWidth: 160, fontWeight: 700, height: 48 }}
              >
                تسجيل دخول
              </Button>
            </div>
          </div>

          <Card
            bordered={false}
            style={{
              borderRadius: 18,
              background: palette.surface,
              boxShadow: '0 16px 36px rgba(2,6,23,0.12)',
            }}
            bodyStyle={{ padding: 16 }}
          >
            <div style={{ marginBottom: 10 }}>
              <Text style={{ color: palette.textMuted }}>نموذج لوحة التحكم</Text>
              <Title level={4} style={{ marginTop: 4, marginBottom: 0, color: palette.text }}>
                شاشة إدارة عروض مدعومة بالذكاء الاصطناعي
              </Title>
            </div>
            <div
              style={{
                borderRadius: 14,
                border: '1px solid #dbe7ff',
                padding: 12,
                background: 'linear-gradient(160deg, #f8fbff 0%, #ffffff 100%)',
              }}
            >
              <Card
                size="small"
                style={{
                  borderRadius: 12,
                  marginBottom: 10,
                  transform: 'perspective(900px) rotateY(-8deg) rotateX(4deg)',
                  boxShadow: '0 14px 28px rgba(30,58,138,0.18)',
                }}
              >
                <Text strong>النص المدخل:</Text>
                <Paragraph style={{ marginBottom: 0 }}>
                  "فيلا في شمال جدة، 540م، السعر أقل من 2.8 مليون..."
                </Paragraph>
              </Card>
              <Card
                size="small"
                style={{
                  borderRadius: 12,
                  transform: 'perspective(900px) rotateY(-3deg)',
                  border: '1px solid #e2e8f0',
                }}
              >
                <Text strong>النتيجة:</Text>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <Tag>المدينة: جدة</Tag>
                  <Tag>النوع: فيلا</Tag>
                  <Tag>المساحة: 540 م²</Tag>
                  <Tag>السعر: 2,800,000</Tag>
                </div>
              </Card>
            </div>
          </Card>
        </div>

        <Card
          bordered={false}
          style={{
            marginTop: 16,
            borderRadius: 14,
            background: palette.surfaceSoft,
            border: palette.surfaceBorder,
          }}
          bodyStyle={{ padding: '10px 16px' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
            <Text style={{ color: palette.textMuted }}>موثوق من فرق مبيعات ومكاتب عقارية</Text>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', opacity: 0.58 }}>
              <Text strong style={{ color: palette.text }}>ألفا العقارية</Text>
              <Text strong style={{ color: palette.text }}>أوربن بروبرتي</Text>
              <Text strong style={{ color: palette.text }}>بيت هَب</Text>
              <Text strong style={{ color: palette.text }}>نقلة العقار</Text>
            </div>
          </div>
        </Card>

        <div
          id="features"
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {featureCards.map((item) => (
            <Card
              key={item.title}
              bordered={false}
              style={{
                borderRadius: 16,
                boxShadow: '0 12px 26px rgba(15,23,42,0.06)',
                height: '100%',
                border: palette.surfaceBorder,
                background: palette.surface,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <item.icon style={{ fontSize: 22, color: iconAccent }} />
                <Text strong style={{ fontSize: 18, color: palette.text }}>
                  {item.title}
                </Text>
              </div>
              <Text style={{ color: palette.textMuted }}>{item.desc}</Text>
            </Card>
          ))}
        </div>

        <div id="preview" style={{ marginTop: 22 }}>
          <Card
            bordered={false}
            style={{ borderRadius: 18, boxShadow: '0 14px 30px rgba(15,23,42,0.07)', border: palette.surfaceBorder, background: palette.surface }}
          >
            <Title level={3} style={{ marginTop: 0, color: palette.text }}>
              شاهد كيف يتحول النص إلى عرض جاهز
            </Title>
            <Paragraph style={{ color: palette.textMuted }}>
              هذا القسم يمثل معاينة لرحلة المستخدم من إدخال نص عقاري إلى بطاقة منظمة قابلة للنشر.
            </Paragraph>
            <div
              style={{
                borderRadius: 14,
                padding: 14,
                background: 'linear-gradient(140deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
                color: '#fff',
              }}
            >
              <Text style={{ color: '#cbd5e1' }}>مراحل المعالجة بالذكاء الاصطناعي</Text>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <Card size="small" style={{ borderRadius: 10 }}><Text strong>1) إدخال النص</Text></Card>
                <Card size="small" style={{ borderRadius: 10 }}><Text strong>2) التحليل الذكي</Text></Card>
                <Card size="small" style={{ borderRadius: 10 }}><Text strong>3) استخراج الحقول</Text></Card>
                <Card size="small" style={{ borderRadius: 10 }}><Text strong>4) بطاقة جاهزة</Text></Card>
              </div>
            </div>
          </Card>
        </div>

        <Card
          id="contact"
          bordered={false}
          style={{ marginTop: 18, borderRadius: 14, border: palette.surfaceBorder, boxShadow: '0 8px 20px rgba(15,23,42,0.05)', background: palette.surfaceSoft }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <Text strong style={{ fontSize: 16, color: palette.text }}>جاهز ترفع مستوى مكتبك؟</Text>
              <br />
              <Text style={{ color: palette.textMuted }}>تواصل معنا أو ابدأ التجربة الآن خلال دقيقة.</Text>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => navigate('/auth?mode=login')}>تسجيل الدخول</Button>
              <Button type="primary" onClick={() => navigate('/auth?mode=register')}>إنشاء حساب</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LandingPage;
