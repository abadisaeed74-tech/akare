import React, { useEffect, useState } from 'react';
import { Card, Typography, Spin, Alert, Button, Descriptions, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getSettingsOverview,
  createStripeCheckoutSession,
  createStripePortalSession,
  confirmStripeCheckoutSession,
  type SettingsOverview,
} from '../services/api';

const { Title, Text } = Typography;

const PLAN_CATALOG: Record<
  string,
  { key: string; name: string; price_monthly_sar?: number | null }
> = {
  starter: { key: 'starter', name: 'خطة المكاتب الصغيرة', price_monthly_sar: 99 },
  business: { key: 'business', name: 'خطة المكاتب المتوسطة', price_monthly_sar: 249 },
  enterprise: { key: 'enterprise', name: 'خطة الشركات', price_monthly_sar: 799 },
};

const StripeCheckoutPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<SettingsOverview | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getSettingsOverview();
        setOverview(data);
      } catch (e: any) {
        const detail = e?.response?.data?.detail || 'فشل في تحميل بيانات الاشتراك.';
        setError(detail);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const statusFromQuery = searchParams.get('status');
    const sessionId = searchParams.get('session_id');
    if (statusFromQuery !== 'success' || !sessionId) {
      return;
    }

    const confirm = async () => {
      try {
        setConfirmingPayment(true);
        await confirmStripeCheckoutSession(sessionId);
        const refreshed = await getSettingsOverview();
        setOverview(refreshed);
        message.success('تم تأكيد الدفع وتفعيل الاشتراك بنجاح.');
      } catch (e: any) {
        const detail =
          e?.response?.data?.detail || 'تم الدفع لكن لم يتم تأكيد الاشتراك تلقائيًا بعد.';
        message.warning(detail);
      } finally {
        setConfirmingPayment(false);
      }
    };

    confirm();
  }, [searchParams]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert type="error" message={error || 'فشل في تحميل صفحة الدفع.'} />
      </div>
    );
  }

  const planFromQuery = searchParams.get('plan');
  const statusFromQuery = searchParams.get('status');
  const activePlanKey = (planFromQuery || overview.plan_usage.plan.key || 'starter').toLowerCase();
  const activePlan =
    PLAN_CATALOG[activePlanKey] ||
    (activePlanKey === overview.plan_usage.plan.key
      ? overview.plan_usage.plan
      : {
          key: activePlanKey,
          name: activePlanKey,
          price_monthly_sar: undefined,
        });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #eef1ec 0%, #f4f5f2 52%, #ecefe8 100%)',
        direction: 'rtl',
        padding: 16,
      }}
    >
      <Card style={{ width: 500, boxShadow: '0 12px 28px rgba(41,66,49,0.08)', borderRadius: 18, border: '1px solid #e4e7df' }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          صفحة الدفع
        </Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 16 }}>
          سيتم تحويلك إلى صفحة Stripe الآمنة لإتمام الاشتراك.
        </Text>

        {statusFromQuery === 'success' && (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
            message="تمت عملية الدفع بنجاح"
            description={
              confirmingPayment
                ? 'جاري تأكيد الاشتراك وتحديث الخطة...'
                : 'إذا لم تتحدث الخطة مباشرة، انتظر لحظات حتى يستقبل النظام إشعار Stripe (Webhook).'
            }
          />
        )}

        {statusFromQuery === 'cancel' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="تم إلغاء عملية الدفع"
            description="يمكنك إعادة المحاولة في أي وقت."
          />
        )}

        <Descriptions bordered column={1} size="middle" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="اسم المكتب">
            {overview.company.company_name || 'لم يتم تحديد اسم الشركة بعد'}
          </Descriptions.Item>
          <Descriptions.Item label="الخطة المختارة">
            {activePlan.name} ({activePlan.key})
          </Descriptions.Item>
          {activePlan.price_monthly_sar != null && (
            <Descriptions.Item label="سعر الاشتراك الشهري">
              {activePlan.price_monthly_sar.toLocaleString('ar-SA')} ر.س / شهر
            </Descriptions.Item>
          )}
        </Descriptions>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="دفع عبر Stripe"
          description="التجديد، الإلغاء، والترقية/التخفيض تتم من بوابة إدارة الفوترة في Stripe."
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Button
            type="primary"
            block
            loading={redirecting}
            style={{ background: '#3f7d3c' }}
            onClick={async () => {
              try {
                setRedirecting(true);
                const successUrl = `${window.location.origin}/billing/checkout?status=success&plan=${activePlan.key}&session_id={CHECKOUT_SESSION_ID}`;
                const cancelUrl = `${window.location.origin}/billing/checkout?status=cancel&plan=${activePlan.key}`;
                const session = await createStripeCheckoutSession({
                  plan_key: activePlan.key,
                  success_url: successUrl,
                  cancel_url: cancelUrl,
                });
                window.location.href = session.url;
              } catch (e: any) {
                const detail = e?.response?.data?.detail || 'فشل في تفعيل الاشتراك.';
                message.error(detail);
                setRedirecting(false);
              }
            }}
          >
            إكمال الدفع عبر Stripe
          </Button>
          <Button
            block
            onClick={async () => {
              try {
                const portal = await createStripePortalSession(
                  `${window.location.origin}/settings`,
                );
                window.location.href = portal.url;
              } catch (e: any) {
                const detail = e?.response?.data?.detail || 'تعذّر فتح بوابة إدارة الفوترة.';
                message.error(detail);
              }
            }}
          >
            إدارة الاشتراك
          </Button>
          <Button block onClick={() => navigate('/settings')}>
            الرجوع إلى الإعدادات
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default StripeCheckoutPage;


