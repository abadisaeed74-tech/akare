# نظرة شاملة على مشروع أكار (Akare Real Estate Platform)

## نظرة عامة
أكار هي منصة لإدارة العروض العقارية بذكاء اصطناعي. تتيح للمكاتب العقارية إضافة عروض عبر نصوص عربية، يتم تحليلها تلقائياً باستخدام Gemini AI لاستخراج البيانات المهمة (مدينة، حي، نوع، مساحة، سعر، ...).

## المكونات الرئيسية

### Backend (FastAPI + PyMongo + Gemini AI)
- **اللغة**: Python 3.x
- **الإطار**: FastAPI
- **قاعدة البيانات**: MongoDB (عبر PyMongo)
- **الذكاء الاصطناعي**: Google Gemini لتحليل نصوص العروض العقارية
- **الملفات الرئيسية**:
  - `main.py`: جميع endpoints API (500+ سطر)
  - `models.py`: Pydantic models (Property, User, CompanySettings, Plans...)
  - `database.py`: MongoDB operations
  - `ai_processor.py`: تحليل النصوص بـ Gemini
  - `requirements.txt`: dependencies

### Frontend (React + TypeScript + Ant Design + Vite)
- **الإطار**: React 18 + TypeScript + Vite
- **المكتبات**: Ant Design, Axios
- **الملفات الرئيسية**:
  - `src/App.tsx`: التطبيق الرئيسي + Router + Auth context
  - `src/services/api.ts`: جميع API calls (50+ functions)

## الشاشات والمكونات الرئيسية (Frontend)

### 1. **صفحة المكتب (PropertyList.tsx)**
```
📱 عرض العروض العقارية (قائمة بتفاصيل كل عرض)
├─ المدينة
├─ الحي  
├─ نوع العقار
├─ المساحة (م²)
├─ السعر (ريال)
├─ تفاصيل
├─ أزرار العمليات:
│  ├─ عرض التفاصيل
│  ├─ تعديل العرض (إذا مسموح)
│  ├─ حذف العرض (إذا مسموح)
│  └─ مشاركة (رابط عام)
```

### 2. **صفحة إضافة عرض (PropertyForm.tsx)**
```
📝 إضافة عرض جديد
├─ النص الأصلي (يُحلل بالذكاء الاصطناعي)
├─ رفع صور
├─ رفع فيديوهات
├─ رفع مستندات (PDF)
└─ رابط الخريطة
```

### 3. **صفحة العرض العام (PublicPropertyPage.tsx)**
```
👁️ عرض تفصيلي لعرض واحد للعملاء العامين
├─ جميع بيانات العرض
├─ عرض الصور كـ gallery
├─ تشغيل الفيديوهات
├─ تحميل المستندات
└ـ رابط Google Maps
```

### 4. **صفحة المكاتب العامة (CompanyPublicPropertiesPage.tsx)**
```
🏢 قائمة عروض مكتب معين للعملاء العامين
└ـ جميع عروض المكتب بدون تسجيل دخول
```

### 5. **صفحة الإعدادات (SettingsPage.tsx)**
```
⚙️ لوحة تحكم المالك
├─ إعدادات الشركة:
│  ├─ اسم الشركة
│  ├─ الشعار
│  ├─ البريد الرسمي
│  ├─ الهاتف
│  └─ السب دومين (akare.co/مكتبك)
├─ الخطط والاشتراك:
│  ├─ عرض الخطط (Starter, Business, Enterprise)
│  ├─ حالة الاستخدام (عدد العروض/المستخدمين)
│  └ـ Stripe checkout
└ـ فريق الموظفين:
    ├─ إضافة موظف (email + كلمة مرور)
    ├─ تعديل الصلاحيات
    └ـ تفعيل/إلغاء تفعيل
```

### 6. **صفحة الدفع (StripeCheckoutPage.tsx)**
```
💳 دفع الاشتراك عبر Stripe
```

### 7. **صفحة تسجيل الدخول (AuthPage.tsx)**
```
🔐 تسجيل دخول / إنشاء حساب
```

### 8. **شجرة التنقل (NavigationTree.tsx)**
```
📂 شجرة ديناميكية (مدن → أحياء)
├ـ حذف العروض بالجملة (مدينة كاملة/حي كامل)
└ـ فلترة سريعة
```

## API Endpoints الرئيسية (Backend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/properties` | إضافة عرض جديد (AI analysis) |
| GET | `/properties` | قائمة العروض مع فلترة |
| PUT | `/properties/{id}` | تعديل عرض |
| DELETE | `/properties/id/{id}` | حذف عرض |
| GET | `/cities` | قائمة المدن |
| GET | `/neighborhoods?city=` | قائمة الأحياء |
| GET | `/search?q=` | بحث كلاسيكي |
| GET | `/ai-search?q=` | بحث ذكي |
| **Public (بدون auth)** |
| GET | `/public/properties/{id}` | عرض واحد عام |
| GET | `/public/companies/{owner_id}` | معلومات مكتب عام |
| GET | `/public/companies/{owner_id}/properties` | عروض مكتب عام |
| **Auth & Settings** |
| POST | `/auth/register` | إنشاء حساب |
| POST | `/auth/login` | تسجيل دخول |
| GET | `/settings/overview` | لوحة الإعدادات |
| PUT | `/settings/company` | تحديث إعدادات الشركة |
| PUT | `/settings/plan` | تغيير الخطة |
| POST | `/settings/team/users` | إضافة موظف |

## الخطط المتاحة
| الخطة | السعر | المستخدمين | العروض | التخزين | سب دومين |
|------|-------|-------------|---------|----------|-----------|
| **Starter** | 99 ريال | 3 | 100 | 2GB | ❌ |
| **Business** | 249 ريال | 10 | 500 | 10GB | ✅ |
| **Enterprise** | 799 ريال | 50 | 5000 | 100GB | ✅ |

## الصلاحيات (Permissions)
```
can_add_property
can_edit_property  
can_delete_property
can_manage_files
```

## تدفق العمل (Workflow)
```
1. المستخدم → تسجيل → Gemini API Key (اختياري)
2. إعدادات الشركة → اختيار خطة → Stripe
3. إضافة عرض → النص العربي → Gemini AI → عرض جاهز
4. فلترة/بحث/شجرة التنقل → عرض التفاصيل
5. مشاركة رابط عام → العميل يرى بدون تسجيل
6. إضافة موظفين → صلاحيات مخصصة
```

## الميزات الفريدة
✅ **تحليل ذكي بالعربية** - Gemini AI
✅ **رفع صور/فيديو/مستندات**
✅ **شجرة تنقل ديناميكية** (مدن → أحياء)
✅ **حذف جماعي** (مدينة/حي كامل)
✅ **نظام اشتراك** مع Stripe
✅ **سب دومين مخصص** للمكاتب
✅ **فريق موظفين** مع صلاحيات
✅ **عروض عامة** بدون تسجيل

## حالة المشروع
✅ **Backend**: جاهز 100%
✅ **Frontend**: جاهز 95% 
⚠️ **أخطاء TypeScript** في بعض الملفات
✅ **Stripe**: جاهز الـ backend (Frontend checkout فقط)
✅ **Cloudflare**: جاهز (trycloudflare)

**الخطوات القادمة**: 
1. إصلاح TypeScript errors
2. Stripe checkout في Frontend
3. اختبار الإنتاج
4. نشر (Vercel + Render + MongoDB Atlas)

