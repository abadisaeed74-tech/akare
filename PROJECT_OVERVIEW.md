# نظرة شاملة على مشروع عقاري (Akare Platform)

## 1) تعريف المشروع
منصة SaaS لإدارة عروض المكاتب العقارية، تشمل:
- إدخال العروض عبر نص عربي حر مع تحليل ذكي.
- إدارة وسائط العرض (صور/فيديو/ملفات) وروابط المشاركة العامة.
- إدارة الاشتراكات والخطط عبر Stripe.
- دعم فريق العمل (مالك + موظفين) بصلاحيات.
- لوحة إدارة للمنصة (Platform Admin) لمتابعة المكاتب والاشتراكات.

> ملاحظة: المنصة تعتمد حاليًا على **مفتاح AI موحد** على مستوى النظام، وليس مفاتيح فردية للمستخدمين.

---

## 2) المعمارية التقنية

### Backend
- **Python + FastAPI**
- **MongoDB** (Motor/PyMongo)
- **Stripe** للفوترة والاشتراكات
- **Gemini API** لتحليل نص العرض
- **Cloudinary** لتخزين الوسائط (اختياري عند تفعيل env)

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
- `backend/main.py`: جميع endpoints والمنطق التشغيلي
- `backend/database.py`: عمليات MongoDB وتجهيز المخرجات
- `backend/models.py`: نماذج Pydantic
- `backend/ai_processor.py`: تكامل Gemini مع fallback/retry
- `backend/requirements.txt`: تبعيات الباكند

### Frontend
- `frontend/src/App.tsx`: هيكل لوحة التحكم والتنقل
- `frontend/src/components/PropertyForm.tsx`: إضافة عرض جديد
- `frontend/src/components/PropertyList.tsx`: قائمة العروض + تفاصيل/تعديل
- `frontend/src/components/PublicPropertyPage.tsx`: صفحة العرض العامة
- `frontend/src/components/CompanyPublicPropertiesPage.tsx`: صفحة عروض المكتب العامة
- `frontend/src/components/SettingsPage.tsx`: الإعدادات والخطط والفريق
- `frontend/src/components/PlatformAdminPage.tsx`: لوحة مالك المنصة
- `frontend/src/services/api.ts`: طبقة API + حل الروابط الإعلامية
- `frontend/src/style.css`: الأنماط العامة

---

## 4) الميزات الوظيفية الحالية

## 4.1 إدارة العروض
- إضافة عرض من نص عربي + رفع وسائط + رابط خرائط.
- تعديل/حذف/مشاركة العرض.
- دعم اختيار متعدد للصور والفيديو عند الإضافة.
- دعم إضافة/حذف الصور والفيديو أثناء تعديل العرض.
- توليد **رقم عرض مختصر** `property_code` تلقائيًا لكل عرض.
- عرض رقم العرض داخل التفاصيل (لوحة التحكم + الصفحة العامة).

## 4.2 البحث والتصفح
- بحث نصي كلاسيكي + بحث heuristic.
- دعم البحث بـ **رقم العرض** `property_code`.
- شجرة مدن/أحياء ديناميكية حسب الحساب.
- حذف جماعي حسب المدينة/الحي (للمالك).

## 4.3 نظام الحسابات والصلاحيات
- نوعا حساب: `owner` و`employee`.
- صلاحيات الموظف:
  - `can_add_property`
  - `can_edit_property`
  - `can_delete_property`
  - `can_manage_files`
- إدارة الموظفين من الإعدادات.

## 4.4 الاشتراكات والفوترة
- Stripe Checkout Session.
- Stripe Billing Portal.
- Webhooks لمزامنة الاشتراك.
- Endpoint تأكيد رجوعي لمعالجة تأخير الويب هوك:
  - `POST /billing/confirm-checkout-session`

## 4.5 التجربة المجانية (Free Trial)
- 30 يوم مجانية.
- مرة واحدة فقط لكل حساب (`trial_used`).
- على خطة `starter` فقط.
- تنتهي تلقائيًا وتحوّل الحساب إلى غير مشترك عند انتهاء المدة.

## 4.6 إظهار/إخفاء العروض حسب الاشتراك
- عند عدم وجود اشتراك نشط:
  - ترجع قوائم العروض والمدن والأحياء والبحث فارغة.
  - ينعكس ذلك على المالك والموظف.
- عند إعادة الاشتراك:
  - تظهر العروض السابقة تلقائيًا (بدون إعادة إدخال).

## 4.7 الذكاء الاصطناعي
- مفتاح موحد من `.env`: `GEMINI_API_KEY`.
- إلغاء المفاتيح الفردية من واجهة المستخدم.
- حد يومي لكل شركة: `AI_DAILY_ANALYSIS_LIMIT=30`.
- إعدادات تقليل التكلفة:
  - `GEMINI_MODEL=gemini-2.5-flash-lite`
  - `GEMINI_FALLBACK_MODELS=gemini-2.5-flash`
  - `AI_MODEL_MAX_RETRIES=1`
- fallback آمن عند أعطال Gemini حتى لا تتعطل إضافة العرض.

## 4.8 الصفحات العامة
- صفحة العرض العامة تعرض **كل الصور** (وليس 4 فقط).
- إخفاء البيانات غير المرغوبة في الصفحة العامة:
  - اسم المالك
  - رقم المالك
  - رقم المسوق
- إخفاء أي معلومة قيمتها `غير مذكور` من الصفحة العامة.
- تحسين رابط الخريطة والتعامل مع الروابط بدون `https`.

## 4.9 الوسائط والتخزين
- دعم Cloudinary في Endpoint الرفع عند تفعيل الإعدادات.
- fallback تلقائي للتخزين المحلي `/uploads` عند عدم تفعيل Cloudinary.
- `resolveMediaUrl` يدعم الروابط القديمة والنسبيّة ويحوّلها للرابط الصحيح.

---

## 5) واجهة المستخدم وتجربة الاستخدام

## 5.1 Landing Page
- عربية بالكامل.
- صفحة الهبوط هي الصفحة الافتراضية.
- قسم الخطط مخفي حاليًا من صفحة الهبوط (مؤقتًا).

## 5.2 Dashboard (`/app`)
- أقسام أساسية: نظرة عامة، قائمة العقارات، الاستفسارات، الإعدادات.
- شجرة المدن/الأحياء تظهر عند الدخول على قسم العقارات.
- بطاقات العرض ثابتة المقاس مع تحسين الأزرار.
- زر إضافة عرض ضمن السايدبار.
- عرض إجمالي العروض + المشاهدات + الاستفسارات الفعلية.

## 5.3 المعارض والصور
- إصلاح تكرار الصور في معاينة لوحة التحكم.
- إلغاء تعارض `Carousel` مع `Image.PreviewGroup` داخل البطاقات.
- تحسين تفاصيل العرض داخل لوحة التحكم لفتح الصور والتنقل بينها بشكل صحيح.

## 5.4 الثيم
- الوضع الليلي **ملغى** حاليًا من المنصة.
- اعتماد هوية بصرية موحّدة فاتحة (أخضر/رمادي).

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
- `POST /upload`

## Public
- `GET /public/properties/{id}`
- `POST /public/properties/{id}/inquiries`
- `GET /public/companies/{owner_id}`
- `GET /public/companies/{owner_id}/properties`
- `GET /public/companies/{owner_id}/ai-search`

## Dashboard / Inquiries
- `GET /dashboard/overview`
- `PUT /dashboard/inquiries/{inquiry_id}/status`

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

## Platform Admin
- `GET /admin/platform-stats`
- `GET /admin/platform-offices`
- `GET /admin/platform-offices/{owner_user_id}`
- `POST /admin/platform-offices/{owner_user_id}/subscription-action`

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
- `UPLOAD_DIR` (اختياري للتخزين المحلي الدائم)
- `CLOUDINARY_CLOUD_NAME` (اختياري)
- `CLOUDINARY_API_KEY` (اختياري)
- `CLOUDINARY_API_SECRET` (اختياري)
- `CLOUDINARY_FOLDER` (اختياري، الافتراضي `akare`)

### Frontend
- `VITE_API_BASE_URL`

---

## 9) ملاحظات تشغيل/إطلاق
- ملف `backend/.env` محلي فقط ولا يجب رفعه.
- في Render يجب ضبط env vars يدويًا.
- يجب تثبيت تبعيات الباكند بعد أي إضافة جديدة في `requirements.txt`.
- `frontend/vercel.json` مهم لتفادي 404 على مسارات SPA.
- يفضل تدوير مفاتيح Stripe/Gemini/Cloudinary دوريًا.

---

## 10) الحالة الحالية للمشروع
- ✅ Backend مستقر ويغطي auth/properties/billing/public/admin.
- ✅ Frontend مبني ويعمل بنجاح.
- ✅ Stripe + free trial + sync logic مطبق.
- ✅ البحث برقم العرض مفعّل.
- ✅ الصفحة العامة تعرض جميع الصور وتخفي البيانات غير المرغوبة.
- ✅ إدارة صور/فيديو العرض أثناء التعديل مفعّلة.
- ✅ Cloudinary مدمج برمجيًا وجاهز عند ضبط القيم الصحيحة.

---

## 11) آخر تحديثات جوهرية (Recent Major Changes)
1. إضافة `property_code` قصير لكل عرض وعرضه في التفاصيل.
2. دعم البحث برقم العرض في `GET /search`.
3. تحسين معالجة الروابط الإعلامية القديمة وتثبيت `resolveMediaUrl`.
4. دمج Cloudinary في `POST /upload` مع fallback محلي.
5. تمكين اختيار متعدد للصور/الفيديو في إضافة العرض.
6. تمكين إضافة/حذف الصور والفيديو من شاشة تعديل العرض.
7. إصلاح تكرار الصور في معاينة لوحة التحكم.
8. عرض كل صور العقار في الصفحة العامة بدل عرض جزئي.
9. إخفاء بيانات المالك/المسوق والحقول غير المذكورة من الصفحة العامة.

