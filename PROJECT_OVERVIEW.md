# نظرة شاملة على مشروع عقاري (Akare Platform)

## 1) تعريف المشروع
منصة SaaS لإدارة العروض العقارية للمكاتب والشركات داخل السعودية، مع:
- إدخال عروض عبر نص عربي حر.
- تحليل ذكي للبيانات العقارية.
- إدارة خطط واشتراكات (Stripe).
- إدارة فريق موظفين بصلاحيات.
- صفحات عامة لمشاركة العروض مع العملاء.

> ملاحظة: المشروع يعتمد حاليًا على **مفتاح AI موحّد للمنصة** (وليس مفاتيح فردية لكل مستخدم).

---

## 2) المعمارية التقنية

### Backend
- **Python + FastAPI**
- **MongoDB** عبر Motor/PyMongo
- **Stripe** للاشتراكات والفوترة
- **Gemini API** لمعالجة النصوص

### Frontend
- **React + TypeScript + Vite**
- **Ant Design**
- **Axios**

### النشر
- **Frontend:** Vercel
- **Backend:** Render
- **Database:** MongoDB Atlas

---

## 3) الملفات الأساسية

### Backend
- `backend/main.py`: جميع endpoints والمنطق التشغيلي (Auth, Billing, Properties, Team, Public...)
- `backend/database.py`: عمليات MongoDB المجمّعة
- `backend/models.py`: نماذج Pydantic
- `backend/ai_processor.py`: تكامل Gemini + retries/fallback
- `backend/requirements.txt`: تبعيات الباكند

### Frontend
- `frontend/src/App.tsx`: لوحة التحكم الرئيسية
- `frontend/src/components/LandingPage.tsx`: صفحة الهبوط
- `frontend/src/components/SettingsPage.tsx`: الإعدادات والخطط والفريق
- `frontend/src/components/StripeCheckoutPage.tsx`: صفحة الدفع/التأكيد
- `frontend/src/components/PublicPropertyPage.tsx`: صفحة عرض عقار عامة
- `frontend/src/components/CompanyPublicPropertiesPage.tsx`: عروض المكتب العامة
- `frontend/src/components/NavigationTree.tsx`: شجرة المدن/الأحياء
- `frontend/src/services/api.ts`: طبقة API
- `frontend/src/style.css`: ثيم عام + تحسينات dark mode

---

## 4) الميزات الوظيفية الحالية

## 4.1 إدارة العروض
- إضافة عرض عبر نص عربي.
- تعديل/حذف/مشاركة العرض.
- رفع صور/فيديو/مستندات + رابط خرائط.
- تفاصيل عرض كاملة في Modal وPublic page.

## 4.2 البحث والتصفح
- بحث كلاسيكي.
- بحث ذكي (heuristic) بدون LLM داخليًا في endpoint البحث.
- شجرة مدن/أحياء ديناميكية.
- حذف جماعي حسب مدينة/حي للمالك.

## 4.3 نظام الحسابات والصلاحيات
- Owner + Employee.
- صلاحيات:
  - `can_add_property`
  - `can_edit_property`
  - `can_delete_property`
  - `can_manage_files`
- إدارة الموظفين من الإعدادات.

## 4.4 الاشتراكات والفوترة
- Stripe Checkout Session.
- Stripe Billing Portal.
- Webhooks لمزامنة الحالات.
- Endpoint تأكيد رجوعي:
  - `/billing/confirm-checkout-session`
  - لمعالجة تأخر webhook.

## 4.5 تجربة مجانية (Free Trial)
- تجربة مجانية **30 يوم**.
- **مرة واحدة فقط** لكل حساب (`trial_used`).
- مقيّدة على **الخطة الأولى فقط**: `starter`.
- حالة الفوترة أثناء التجربة: `trialing`.
- انتهاء التجربة يتحول تلقائيًا إلى حالة غير مشترك.

## 4.6 قواعد إظهار العروض حسب الاشتراك
- عند عدم وجود اشتراك نشط:
  - تختفي العروض من لوحة التحكم عند **المالك والموظف**.
  - `/properties`, `/cities`, `/neighborhoods`, `/search`, `/ai-search` ترجع نتائج فارغة.
- عند التجديد:
  - جميع العروض ترجع تلقائيًا (لا يتم حذفها من قاعدة البيانات).

## 4.7 الذكاء الاصطناعي (AI)
- اعتماد مفتاح موحد عبر `.env`:
  - `GEMINI_API_KEY`
- إلغاء الاعتماد على المفاتيح الفردية في الواجهة.
- حد يومي تحليل:
  - `AI_DAILY_ANALYSIS_LIMIT=30` لكل شركة.
- إعدادات أداء/تكلفة:
  - `GEMINI_MODEL=gemini-2.5-flash-lite`
  - `GEMINI_FALLBACK_MODELS=gemini-2.5-flash`
  - `AI_MODEL_MAX_RETRIES=1`
- fallback تلقائي عند أخطاء AI (`UNAVAILABLE`, `503`, `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`) بحيث لا يتعطل إدخال العرض.

---

## 5) واجهة المستخدم وتجربة الاستخدام

## 5.1 Landing Page
- عربية بالكامل.
- Navbar + Hero + Features + Preview + Pricing + CTA.
- Day/Night mode مع حفظ الحالة في `localStorage`.
- الوضع الافتراضي: **نهاري**.
- تحسين وضوح زر الوضع في dark mode.

## 5.2 Dashboard (`/app`)
- Glassmorphism + ألوان حديثة.
- دعم dark/light مع حفظ التفضيل.
- إزالة بطاقات إحصائية غير مهمة قديمة.
- تحسين محاذاة الهيدر والبحث.
- توحيد أزرار الإعدادات/السجل/التبديل.
- عرض **إجمالي العروض** في الهيدر.
- في حساب الموظف يظهر اسم المكتب المرتبط تلقائيًا.

## 5.3 تحسينات Dark Mode
- تحسين تباين النصوص والأيقونات في Ant components.
- تحسين حالات Tree:
  - normal / hover / selected
- تحسين مظهر Dropdown/Tooltip/Popover/Select في الوضع الليلي.

## 5.4 الصفحات العامة
- `PublicPropertyPage`: عرض كامل للعرض + وسائط + بيانات المكتب.
- `CompanyPublicPropertiesPage`: عروض مكتب عام + بحث.
- إزالة شارة "عرض متاح/غير متاح" من صفحة العروض العامة.

---

## 6) API Endpoints الرئيسية (مختصرة)

## Auth
- `POST /auth/register`
- `POST /auth/login`
- `GET /me`

## Properties (Private)
- `POST /properties`
- `GET /properties`
- `PUT /properties/{id}`
- `DELETE /properties/id/{id}`
- `GET /cities`
- `GET /neighborhoods`
- `GET /search`
- `GET /ai-search`

## Public
- `GET /public/properties/{id}`
- `GET /public/companies/{owner_id}`
- `GET /public/companies/{owner_id}/properties`
- `GET /public/companies/{owner_id}/ai-search`

## Settings / Team
- `GET /settings/overview`
- `PUT /settings/company`
- `PUT /settings/plan`
- `POST /settings/subdomain/check`
- `PUT /settings/subdomain`
- `GET /settings/team/users`
- `POST /settings/team/users`
- `PUT /settings/team/users/{user_id}`

## Billing
- `POST /billing/checkout-session`
- `POST /billing/portal-session`
- `POST /billing/confirm-checkout-session`
- `POST /billing/webhook`
- `POST /billing/activate-subscription`
- `POST /billing/start-free-trial`

---

## 7) الخطط (Plans)
| Plan | السعر الشهري | المستخدمون | العروض | التخزين | سب دومين |
|---|---:|---:|---:|---:|---|
| `starter` | 99 SAR | 3 | 100 | 2 GB | لا |
| `business` | 249 SAR | 10 | 500 | 10 GB | نعم |
| `enterprise` | 799 SAR | 50 | 5000 | 100 GB | نعم |

---

## 8) إعدادات البيئة المهمة

### Backend
- `MONGO_DETAILS`
- `SECRET_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_FALLBACK_MODELS`
- `AI_MODEL_MAX_RETRIES`
- `AI_DAILY_ANALYSIS_LIMIT`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_BUSINESS_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `FRONTEND_BASE_URL`

### Frontend
- `VITE_API_BASE_URL` (يفضل ضبطها صراحة على رابط Render)

---

## 9) ملاحظات تشغيل/إطلاق
- ملف `backend/.env` محلي فقط ولا يجب رفعه.
- `frontend/vercel.json` يحتوي rewrite لتفادي 404 في SPA.
- يجب التأكد من وصول webhooks في Stripe إلى Render endpoint.
- يفضّل تدوير مفاتيح Stripe/Gemini دوريًا لأسباب أمنية.

---

## 10) الحالة الحالية للمشروع
- ✅ Backend يعمل ومستقر وظيفيًا.
- ✅ Frontend مبني بنجاح.
- ✅ تكامل Stripe مكتمل مع fallback تأكيد.
- ✅ Free trial مفعّل ومرن.
- ✅ منطق إخفاء العروض عند انتهاء الاشتراك مطبق.
- ✅ تحسينات dark mode والـ UI مطبقة.
- ✅ النشر على Vercel/Render قائم.

---

## 11) آخر تحديثات جوهرية (Recent Major Changes)
1. اعتماد AI موحد للمنصة + إلغاء المفاتيح الفردية من الواجهة.
2. إضافة حد يومي AI لكل حساب (30 تحليل).
3. إصلاح Stripe confirm/session sync.
4. إضافة retries/fallback لموديلات Gemini لتقليل التأخير والكلفة.
5. تحسين شامل للـ dark mode والهوية البصرية.
6. إضافة free trial 30 يوم مع قيد مرة واحدة.
7. تقييد free trial على الخطة الأولى فقط.
8. إخفاء كل العروض عند انتهاء الاشتراك (Owner + Employee) وإعادتها بعد التجديد.
9. إضافة إجمالي العروض في هيدر لوحة التحكم.
10. تحسين عرض اسم المكتب في حساب الموظف.

