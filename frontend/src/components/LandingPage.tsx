import React from 'react';
import { Button, Card, Collapse, Image, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  ThunderboltOutlined,
  AppstoreOutlined,
  TeamOutlined,
  LinkOutlined,
  BarChartOutlined,
  WarningOutlined,
  FolderOpenOutlined,
  ClockCircleOutlined,
  UserDeleteOutlined,
  CheckCircleOutlined,
  RocketOutlined,
  SolutionOutlined,
} from '@ant-design/icons';
import PlatformLogo from './PlatformLogo';
import overviewShot from '../assets/landing/overview.png';
import propertyListShot from '../assets/landing/property-list.png';
import publicPropertyShot from '../assets/landing/public-property.png';
import settingsTeamShot from '../assets/landing/settings-team.png';

const { Title, Text, Paragraph } = Typography;

const problemItems = [
  { icon: WarningOutlined, title: 'فوضى واتساب وإكسل', desc: 'البيانات موزعة بين محادثات وجداول بدون مرجعية واضحة.' },
  { icon: FolderOpenOutlined, title: 'تشتت الصور والملفات', desc: 'صور العرض والملفات تتبعثر ويصعب الوصول لها وقت العميل.' },
  { icon: UserDeleteOutlined, title: 'ضياع العملاء والطلبات', desc: 'طلبات العملاء تضيع بسبب غياب نظام متابعة مركزي.' },
  { icon: ClockCircleOutlined, title: 'بطء نشر العروض', desc: 'الإدخال اليدوي يستهلك وقت المسوّق ويؤخر الإغلاق.' },
];

const featureItems = [
  { icon: ThunderboltOutlined, title: 'إضافة عقار بالذكاء الاصطناعي', desc: 'اكتب وصفًا حرًا بالعربية والنظام يحوله لبيانات عقارية منظمة.' },
  { icon: AppstoreOutlined, title: 'إدارة العروض من مكان واحد', desc: 'كل عقارات مكتبك في لوحة واحدة مع بحث وتصفية سريعة.' },
  { icon: TeamOutlined, title: 'إدارة الفريق والصلاحيات', desc: 'أنشئ حسابات موظفين وحدد من يضيف أو يعدّل أو يحذف.' },
  { icon: LinkOutlined, title: 'روابط عامة احترافية', desc: 'شارك العرض برابط جاهز للعميل مع صفحة منظمة وواضحة.' },
  { icon: SolutionOutlined, title: 'إدارة الطلبات والعملاء', desc: 'تتبع طلبات العملاء ومتابعتهم حتى الإغلاق.' },
{ icon: BarChartOutlined, title: 'متابعة الأداء والنتائج', desc: 'راقب عدد العروض والمشاهدات والطلبات لاتخاذ قرارات أسرع.' },
];

const pricingPlans = [
  {
    key: 'starter',
    name: 'مبتدئ',
    price: '99 ر.س',
    subtitle: 'مناسبة للمكاتب الصغيرة والمتوسطة',
bullets: [
      'إدارة عقارات وعملاء ومتابعات',
      'حتى 3 مستخدمين',
      'حتى 60 عقار',
      'CRM كامل',
      'المواعيد والمتابعات',
      'البحث الذكي',
      'مشاركة العقارات',
      'تخزين 2 ج.ب',
      'دعم أساسي',
    ],
    highlighted: false,
  },
  {
    key: 'business',
    name: 'احترافي',
    price: '199 ر.س',
    subtitle: 'للمكاتب العقارية الجادة والفرق',
bullets: [
      'إدارة فريق وصلاحيات متقدمة',
      'حتى 8 مستخدمين',
      'حتى 120 عقار',
      'Subdomain',
      'AI أعلى',
      'تقارير وإحصائيات أفضل',
      'موقع أساسي',
      'تخزين 10 ج.ب'
    ],
    highlighted: true,
    badge: 'الأكثر استخدامًا',
  },
  {
    key: 'enterprise',
    name: 'مؤسسات',
    price: '599 ر.س',
    subtitle: 'للشركات والفرق الكبيرة',
bullets: [
      'جميع ميزات مبتدئ واحترافي',
      'تشغيل متكامل للمكتب العقاري',
      'مستخدمين بلا حدود',
      'عقارات بلا حدود',
      'أداء أعلى',
      'دعم مخصص',
      'حلول قابلة للتوسع',
      'تخزين 100 ج.ب'
    ],
    highlighted: false,
  },
];

const faqItems = [
  { key: '1', label: 'هل يوجد تجربة مجانية؟', children: 'نعم، يمكنك البدء بتجربة مجانية لمدة 30 يوم على الخطة الأولى.' },
  { key: '2', label: 'هل أحتاج خبرة تقنية لاستخدام عقاري؟', children: 'لا، الواجهة مصممة للمكاتب العقارية مباشرة وبخطوات بسيطة وواضحة.' },
  { key: '3', label: 'هل يمكن إضافة موظفين بصلاحيات مختلفة؟', children: 'نعم، يمكنك إنشاء فريق عمل وتخصيص صلاحيات كل موظف حسب الدور.' },
  { key: '4', label: 'هل بياناتي محفوظة؟', children: 'نعم، البيانات مخزنة بشكل مركزي وآمن مع نظام وصول حسب الصلاحيات.' },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const palette = {
    pageBg: 'linear-gradient(180deg, #f7faf7 0%, #eef3ed 100%)',
    card: '#ffffff',
    border: '#e3e9e3',
    text: '#1f2f24',
    muted: '#5c6b61',
    accent: '#2f7a42',
    accentSoft: '#eef8f0',
  };

  const sectionTitle = (text: string, sub: string) => (
    <div style={{ marginBottom: 18 }}>
      <Title level={2} style={{ margin: 0, color: palette.text }}>{text}</Title>
      <Paragraph style={{ margin: '8px 0 0', color: palette.muted }}>{sub}</Paragraph>
    </div>
  );

  return (
    <div style={{ direction: 'rtl', background: palette.pageBg, minHeight: '100vh', padding: '20px 14px 48px' }}>
      <div style={{ maxWidth: 1140, margin: '0 auto' }}>
        <Card
          variant="borderless"
          style={{ borderRadius: 16, border: `1px solid ${palette.border}`, marginBottom: 18 }}
          styles={{ body: { padding: '10px 14px' } }}
        >
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <PlatformLogo width={120} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="#features" style={{ color: palette.muted, textDecoration: 'none', fontWeight: 600 }}>المميزات</a>
              <a href="#pricing" style={{ color: palette.muted, textDecoration: 'none', fontWeight: 600 }}>الخطط</a>
              <a href="#faq" style={{ color: palette.muted, textDecoration: 'none', fontWeight: 600 }}>الأسئلة الشائعة</a>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => navigate('/auth?mode=login')}>تسجيل الدخول</Button>
              <Button type="primary" onClick={() => navigate('/auth?mode=register')} style={{ background: palette.accent }}>
                ابدأ مجانًا
              </Button>
            </div>
          </div>
        </Card>

        <Card
          variant="borderless"
          style={{ borderRadius: 24, border: `1px solid ${palette.border}` }}
          styles={{ body: { padding: 24 } }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22 }}>
            <div>
              <Tag color="green" style={{ borderRadius: 999, paddingInline: 12, marginBottom: 14 }}>
                منصة مصممة خصيصًا للسوق العقاري السعودي
              </Tag>
              <Title level={1} style={{ margin: 0, color: palette.text, lineHeight: 1.35 }}>
                أدر مكتبك العقاري بذكاء...
                <br />
                وحوّل الفوضى إلى مبيعات
              </Title>
              <Paragraph style={{ color: palette.muted, fontSize: 17, marginTop: 12, marginBottom: 18, lineHeight: 1.9 }}>
                عقاري يجمع عروضك، فريقك، واستفسارات عملائك في نظام واحد. أضف العقار بنص عربي حر،
                وسيحوّله الذكاء الاصطناعي إلى عرض جاهز للمشاركة خلال دقائق.
              </Paragraph>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<RocketOutlined />}
                  style={{ minWidth: 200, height: 48, fontWeight: 700, background: palette.accent }}
                  onClick={() => navigate('/auth?mode=register')}
                >
                  ابدأ تجربتك المجانية 30 يوم
                </Button>
                <Button
                  size="large"
                  style={{ minWidth: 170, height: 48, fontWeight: 700 }}
                  onClick={() => navigate('/auth?mode=login')}
                >
                  احجز عرض توضيحي
                </Button>
              </div>
            </div>

            <Card
              variant="borderless"
              style={{ borderRadius: 16, border: `1px solid ${palette.border}`, background: '#fbfefb' }}
              styles={{ body: { padding: 14 } }}
            >
              <Text style={{ color: palette.muted }}>واجهة النظام</Text>
              <Title level={4} style={{ marginTop: 6, color: palette.text }}>لوحة تحكم عقاري (Mockup)</Title>
              <div style={{ borderRadius: 12, border: `1px solid ${palette.border}`, overflow: 'hidden', marginTop: 10, position: 'relative' }}>
                <Image
                  src={overviewShot}
                  alt="لقطة من لوحة التحكم"
                  preview={{ mask: 'اضغط للتكبير' }}
                  style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 290 }}
                />
                <Tag color="green" style={{ position: 'absolute', top: 10, right: 10, borderRadius: 999, margin: 0 }}>
                  أحدث العروض والاستفسارات
                </Tag>
              </div>
            </Card>
          </div>
        </Card>

        <div style={{ marginTop: 26 }}>
          {sectionTitle('المشكلة التي نحلها في السوق', 'أغلب المكاتب العقارية تعاني من نفس الفوضى التشغيلية يوميًا.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
            {problemItems.map((item) => (
              <Card key={item.title} variant="borderless" style={{ border: `1px solid ${palette.border}`, borderRadius: 14 }}>
                <item.icon style={{ fontSize: 22, color: '#bf9b30' }} />
                <Title level={5} style={{ margin: '10px 0 6px', color: palette.text }}>{item.title}</Title>
                <Text style={{ color: palette.muted }}>{item.desc}</Text>
              </Card>
            ))}
          </div>
        </div>

        <div id="features" style={{ marginTop: 28 }}>
          {sectionTitle('مميزات عقاري للمكاتب والمسوقين', 'كل أداة تحتاجها لإدارة عملياتك العقارية من أول إدخال العرض حتى متابعة العميل.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            {featureItems.map((item) => (
              <Card key={item.title} variant="borderless" style={{ border: `1px solid ${palette.border}`, borderRadius: 14 }}>
                <item.icon style={{ fontSize: 22, color: palette.accent }} />
                <Title level={5} style={{ margin: '10px 0 6px', color: palette.text }}>{item.title}</Title>
                <Text style={{ color: palette.muted }}>{item.desc}</Text>
              </Card>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          {sectionTitle('كيف يعمل النظام؟', '3 خطوات بسيطة لتحويل العرض إلى فرصة بيع فعلية.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {[
              'أضف وصف العقار بالعربية كما هو',
              'الذكاء الاصطناعي يحلل البيانات وينظمها',
              'انشر الرابط وابدأ استقبال الاستفسارات',
            ].map((step, i) => (
              <Card key={step} variant="borderless" style={{ borderRadius: 14, border: `1px solid ${palette.border}` }}>
                <Tag color="green" style={{ borderRadius: 999 }}>الخطوة {i + 1}</Tag>
                <Paragraph style={{ margin: '10px 0 0', color: palette.text, fontWeight: 600 }}>{step}</Paragraph>
              </Card>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          {sectionTitle('لقطات من النظام', 'نماذج للشاشات الأساسية التي يستخدمها فريقك يوميًا.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            {[
              { label: 'لوحة التحكم', image: overviewShot },
              { label: 'قائمة العقارات', image: propertyListShot },
              { label: 'صفحة العرض العامة', image: publicPropertyShot },
              { label: 'الإعدادات والفريق', image: settingsTeamShot },
            ].map((item) => (
              <Card key={item.label} variant="borderless" style={{ borderRadius: 14, border: `1px solid ${palette.border}` }} styles={{ body: { padding: 10 } }}>
                <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${palette.border}` }}>
                  <Image
                    src={item.image}
                    alt={item.label}
                    preview={{ mask: 'اضغط للتكبير' }}
                    style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <Text strong style={{ color: palette.text, marginTop: 8, display: 'block' }}>{item.label}</Text>
              </Card>
            ))}
          </div>
        </div>

        <div id="pricing" style={{ marginTop: 28 }}>
          {sectionTitle('خطط واضحة تناسب حجم مكتبك', 'ابدأ بالخطة المناسبة اليوم، وارتقِ وقتما احتجت.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
{pricingPlans.map((plan) => (
              <Card
                key={plan.key}
                variant="borderless"
                style={{
                  borderRadius: 14,
                  border: `1px solid ${plan.highlighted ? palette.accent : plan.key === 'enterprise' ? '#8b5cf6' : palette.border}`,
                  boxShadow: plan.highlighted ? '0 14px 30px rgba(47,122,66,0.18)' : plan.key === 'enterprise' ? '0 14px 30px rgba(139,92,246,0.18)' : undefined,
                  background: plan.highlighted ? palette.accentSoft : plan.key === 'enterprise' ? '#f5f3ff' : '#fff',
                }}
              >
                {plan.badge && <Tag color={plan.key === 'business' ? 'gold' : 'purple'}>{plan.badge}</Tag>}
                <Title level={4} style={{ marginTop: 8, color: palette.text }}>{plan.name}</Title>
                <Title level={2} style={{ margin: '4px 0', color: palette.text }}>{plan.price}<Text style={{ color: palette.muted }}> / شهريًا</Text></Title>
                <Paragraph style={{ color: palette.muted }}>{plan.subtitle}</Paragraph>
                <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                  {plan.bullets.map((b) => (
                    <Text key={b} style={{ color: palette.text }}>
                      <CheckCircleOutlined style={{ color: palette.accent, marginLeft: 6 }} />
                      {b}
                    </Text>
                  ))}
                </div>
                <Button
                  block
                  type={plan.highlighted ? 'primary' : 'default'}
                  style={plan.highlighted ? { background: palette.accent } : plan.key === 'enterprise' ? { background: '#8b5cf6' } : undefined}
                  onClick={() => navigate('/auth?mode=register')}
                >
                  ابدأ مجانًا
                </Button>
              </Card>
            ))}
          </div>
        </div>

        <div id="faq" style={{ marginTop: 28 }}>
          {sectionTitle('الأسئلة الشائعة', 'إجابات سريعة قبل أن تبدأ.')}
          <Collapse items={faqItems} />
        </div>

        <Card
          variant="borderless"
          style={{ marginTop: 28, borderRadius: 18, border: `1px solid ${palette.border}`, background: `linear-gradient(135deg, ${palette.accentSoft}, #ffffff)` }}
        >
          <Title level={2} style={{ marginTop: 0, color: palette.text }}>
            ابدأ اليوم... وخلي إدارة مكتبك العقاري أكثر احترافية وربحية
          </Title>
          <Paragraph style={{ color: palette.muted, fontSize: 16 }}>
            جرّب عقاري لمدة 30 يوم مجانًا، واكتشف كيف تقلل الوقت التشغيلي وتزيد سرعة إغلاق الصفقات.
          </Paragraph>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Button
              type="primary"
              size="large"
              style={{ minWidth: 240, height: 48, fontWeight: 700, background: palette.accent }}
              onClick={() => navigate('/auth?mode=register')}
            >
              ابدأ تجربتك المجانية الآن
            </Button>
            <Button
              size="large"
              style={{ minWidth: 170, height: 48, fontWeight: 700 }}
              onClick={() => navigate('/auth?mode=login')}
            >
              احجز عرض توضيحي
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LandingPage;
