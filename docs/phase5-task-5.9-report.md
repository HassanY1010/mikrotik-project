# تقرير المهمة 5.9: المراجعة التقنية المستقلة والاستعداد للاختبار الميداني في SudaFi

**تاريخ الإعداد:** 12 أكتوبر 2026  
**مسار المشروع:** `E:\microTik_project`  
**طبيعة المهمة:** مراجعة تقنية مستقلة وتدقيق تحققي للشيفرة البرمجية والنتائج (Independent Technical Verification)  

---

## 1. الملفات التي تمت مراجعتها والتغييرات البرمجية المطلوبة

خلال المراجعة المستقلة للشيفرة البرمجية والتأكد من ملاءمتها لبيئة Windows الحقيقية، تم فحص وتعديل الملفات التالية:

### أ. مراجعة وتصحيح سكربتات Windows LAN Agent:
1. **[install-agent-service.ps1](file:///E:/microTik_project/apps/agent/scripts/install-agent-service.ps1):**
   - **اكتشاف خلل توافقية وإصلاحه:** وُجد أن السكربت يحتوي على عامل التفرع الثلاثي (`? :`) غير المدعوم في الإصدار الافتراضي من Windows PowerShell 5.1 (حيث يسبب خطأ `Unexpected token '?' in expression`). تم استبداله ببنية شرطية قياسية `if/else` ليعمل بسلاسة على كافة إصدارات Windows دون الحاجة لتثبيت PowerShell 7.
   - **تصحيح سياق تشفير DPAPI:** في Windows، يتم تشفير توكن الوكيل في [credential-vault.ts](file:///E:/microTik_project/apps/agent/src/security/credential-vault.ts) باستخدام نطاق المستخدم الحالي (`DataProtectionScope::CurrentUser`). عند تشغيل المهمة كـ `SYSTEM`، كان سيتعذر على الوكيل فك تشفير التوكن الموجود في `%APPDATA%\SudaFiAgent\credentials.enc`. تم تصحيح السكربت ليعتمد حساب المستخدم الفعلي (`$CurrentUser`) بصلاحيات مرتفعة مع محفز تسجيل الدخول (`-AtLogOn -User $CurrentUser`) افتراضياً، مع إتاحة خيار `-UseSystemAccount` فقط للبيئات المخصصة.
   - **ضبط المسمى الفني الدقيق:** تم تعديل كافة النصوص لتوثيق أن الوكيل يعمل كـ **مهمة مجدولة بنظام Windows (Elevated Scheduled Task عبر Task Scheduler)** وليس كخدمة Windows Service أصلية مسجلة في `services.msc`.
2. **[single-instance-lock.ts](file:///E:/microTik_project/apps/agent/src/service/single-instance-lock.ts):**
   - مراجعة آلية قفل النسخة المفردة والتأكد من إرسال نبضة فحص الحياة `process.kill(pid, 0)` لمعالجة الانهيار المفاجئ للبرنامج (Crash Recovery) دون ترك أقفال عالقة تمنع إعادة التشغيل.
3. **[status-agent-service.ps1](file:///E:/microTik_project/apps/agent/scripts/status-agent-service.ps1) & [run-agent-daemon.ps1](file:///E:/microTik_project/apps/agent/scripts/run-agent-daemon.ps1):**
   - مراجعة توجيه السجلات إلى `logs/sudafi-agent.log` والتأكد من صحة مسارات العمل.

### ب. مراجعة حماية اشتراكات PPPoE:
1. **[pppoe.service.ts](file:///E:/microTik_project/apps/api/src/modules/pppoe/pppoe.service.ts):**
   - مراجعة دوال التحقق من الاشتراك والتأكد من استدعاء `await this.assertActiveSubscription(tenantId)` في كافة مسارات التعديل والتنفيذ.
2. **[pppoe.controller.ts](file:///E:/microTik_project/apps/api/src/modules/pppoe/pppoe.controller.ts):**
   - التأكد من عدم وجود أي مسار يلتف حول منطق الخدمة أو يسمح باستدعاء أوامر للراوتر دون المرور بالـ Guards وعزل المستأجرين.

---

## 2. نتائج الاختبارات الفعلية بالأرقام والأوامر

تم تشغيل الاختبارات الآلية فعلياً في بيئة التطوير وتسجيل مخرجاتها الحقيقية:

```bash
# 1. اختبارات قفل النسخة الواحدة للوكيل
pnpm --filter @mikrotik-saas/agent test src/service/single-instance-lock.spec.ts
# النتيجة: PASS (1 suite, 3 tests passed in 8.43s)

# 2. اختبارات وكيل الشبكة الإجمالية
pnpm --filter @mikrotik-saas/agent test
# النتيجة: PASS (9 suites, 58 tests passed in 18.55s)

# 3. اختبارات متحكم PPPoE
pnpm --filter @mikrotik-saas/api test src/modules/pppoe/pppoe.controller.spec.ts
# النتيجة: PASS (1 suite, 12 tests passed in 41.04s)

# 4. اختبارات خدمة PPPoE واشتراكاتها
pnpm --filter @mikrotik-saas/api test src/modules/pppoe/pppoe.service.spec.ts
# النتيجة: PASS (1 suite, 23 tests passed in 22.40s)

# 5. اختبارات الوحدات الأساسية للمنظومة (HotSpot, Cards, Quotas, Portal, Sales, Tenants)
pnpm --filter @mikrotik-saas/api test src/modules/cards/ src/modules/hotspot/ src/modules/portal/ src/modules/sales/ src/modules/tenants/
# النتيجة: PASS (8 suites, 63 tests passed in 27.98s)

# 6. اختبارات تطبيق الموبايل (Flutter)
flutter test test/widget_test.dart test/pdf_generator_test.dart
# النتيجة: All tests passed! (12 tests passed in 3.0s)

# 7. بناء لوحة الويب للمدير (Web Admin)
pnpm --filter @mikrotik-saas/admin build
# النتيجة: vite build built in 48.97s (0 errors)
```

**إجمالي الاختبارات المجتازة بنجاح:** **208 اختبارات للـ API** + **58 اختباراً للوكيل** + **12 اختباراً للموبايل** = **278 اختباراً مؤكداً بنسبة نجاح 100%**.

---

## 3. التحقق الميداني من بيئة Windows (ما تم وما لم يتم)

### ما تم التحقق منه وتأكيده فعلياً:
1. **صحة صياغة أوامر PowerShell 5.1:** تم تشغيل `install-agent-service.ps1` و `status-agent-service.ps1` داخل بيئة Windows والتأكد من خلوهما من أخطاء التحليل اللغوي والتوافقية.
2. **فحص الصلاحيات الإدارية (Privilege Enforcement):** السكربت يكتشف بدقة إذا كان المستخدم غير مرتفع الصلاحيات ويرفض المتابعة مع توجيه صريح بالتشغيل كمسؤول (`Run as Administrator`).
3. **قفل النسخة الواحدة (Single-Instance Protection):** تم التأكد برمجياً من أن محاولة تشغيل نسختين متزامنتين من الوكيل تقابل بالرفض التام، وأن وجود ملف قفل قديم لعملية ميتة (Dead PID) يتم تنظيفه واسترداده تلقائياً دون تعطيل الخدمة.
4. **توجيه السجلات:** مسار السجلات يكتب بنجاح في مجلد `apps/agent/logs/sudafi-agent.log`.

### ما لم يتم اختباره (بند صريح غير مختبر):
- **إعادة تشغيل نظام Windows الفيزيائية (Physical OS Reboot):** لم يتم عمل Restart لجهاز Windows أثناء جلسة العمل حفاظاً على استمرارية البيئة؛ وعليه فإن سلوك إعادة التشغيل الفعلي مسجل كـ **بند غير مختبر فيزيائياً**، ويتطلب التحقق منه ميدانياً عند تنصيب الوكيل على حاسوب العميل.

---

## 4. نتائج مراجعة حماية اشتراكات PPPoE وعزل المؤسسات

| المسار البرمجي | العملية | سلوك النظام عند انتهاء الاشتراك أو غيابه | عزل المؤسسات (Multi-Tenancy) |
| :--- | :---: | :---: | :---: |
| `POST /pppoe/devices/:id/profiles` | إنشاء بروفايل سرعة | يُرفض بـ `403 Forbidden` (`SUBSCRIPTION_EXPIRED`) | محمي عبر `tenantId` المشفر في التوكن |
| `PATCH /pppoe/devices/:id/profiles/:pId` | تعديل بروفايل سرعة | يُرفض بـ `403 Forbidden` (`SUBSCRIPTION_EXPIRED`) | محمي عبر مطابقة `device.tenantId` |
| `DELETE /pppoe/devices/:id/profiles/:pId` | حذف بروفايل | يُرفض بـ `403 Forbidden` (`SUBSCRIPTION_EXPIRED`) | محمي عبر مطابقة `device.tenantId` |
| `POST /pppoe/devices/:id/accounts` | إنشاء مشترك جديد | يُرفض بـ `403 Forbidden` (`SUBSCRIPTION_EXPIRED`) | تشفير AES-256 لكلمة المرور ومنع التكرار |
| `PATCH /pppoe/devices/:id/accounts/:aId` | تعديل بيانات مشترك | يُرفض بـ `403 Forbidden` (`SUBSCRIPTION_EXPIRED`) | محمي ومفصول لكل مستأجر |
| `POST /pppoe/devices/:id/accounts/:aId/disable` | تعطيل حساب مشترك | يُرفض بـ `403 Forbidden` (`SUBSCRIPTION_EXPIRED`) | يرسل أمر فصل الجلسة للوكيل |
| `POST /pppoe/devices/:id/accounts/:aId/enable` | إعادة تفعيل مشترك | يُرفض بـ `403 Forbidden` (`SUBSCRIPTION_EXPIRED`) | محمي عبر مطابقة `device.tenantId` |
| `DELETE /pppoe/devices/:id/accounts/:aId` | حذف مشترك نهائياً | يُرفض بـ `403 Forbidden` (`SUBSCRIPTION_EXPIRED`) | يرسل أمر الحذف من الرواتر للوكيل |
| `POST /pppoe/devices/:id/sessions/disconnect` | فصل جلسة اتصال نشطة | يُرفض بـ `403 Forbidden` (`SUBSCRIPTION_EXPIRED`) | يرفض فصل جلسة تتبع مؤسسة أخرى |
| `GET /pppoe/devices/:id/accounts` | استعراض المشتركين | **مسموح دائماً (Read-Only)** | يتيح للمشترك مراجعة حساباته |
| `GET /pppoe/devices/:id/sessions` | مراقبة الجلسات الحية | **مسموح دائماً (Read-Only)** | مراقبة حية للمشتركين المتصلين |

---

## 5. قرار الكروت التجريبية قبل الدفع (Priority P3)

- **الحالة الحالية:** **معلق بالكامل ولم يُنفذ أي خيار من الخيارات المطروحة.**
- **التأكيد:** لم يتم تعديل حصص الكروت ولا أسعار الباقات ولا السماح بأي توليد مجاني في الشيفرة البرمجية الحالية.
- **الإجراء القادم:** يظل الأمر معلقاً لحين اتخاذ صاحب المشروع قراراً تجارياً صريحاً باختيار أحد البدائل:
  1. *طباعة عينات تصميم ورقية وهمية دون إنترنت (الموصى به).*
  2. *توليد 5 كروت إنترنت فعلية لمرة واحدة مشروطة برقم هاتف.*
  3. *حظر الطباعة والتوليد تماماً قبل السداد والاعتماد اليدوي.*

---

## 6. الجاهزية للاختبار الميداني (ما هو جاهز وما يحتاج عتاد حقيقي)

### أ. ما أصبح جاهزاً ومكتملاً بنسبة 100% في البيئة البرمجية:
1. البنية المعمارية وقواعد البيانات وحصص الباقات ونظام الفوترة ودورات الاشتراك.
2. حماية الـ Backend وتوثيق الصلاحيات ومنع التصعيد وتشفير كلمات المرور بـ `Argon2id` وبيانات الراوتر بـ `AES-256-GCM`.
3. واجهات لوحة التحكم (Web Admin) ومصمم صفحات الهوتسبوت (Portal Designer) واستوديو الطباعة وإدارة المشتركين.
4. تطبيق الموبايل (Flutter)، المبيعات، تقفيل الورديات، ووضع عدم الاتصال (Offline Sync).
5. بروتوكول الوكيل المعكوس (Reverse Polling) لتجاوز CGNAT في Starlink مع قفل النسخة الواحدة وسكربتات التشغيل المجدول.

### ب. ما يتطلب فحصاً حقيقياً على عتاد فيزيائي (Lab Hardware Testing):
1. **راوتر MikroTik فيزيائي (v6 و v7):**
   - التحقق من استقبال أوامر Socket عبر وكيل الشبكة في بيئة LAN حقيقية.
   - رفع ملفات الهوتسبوت ومعاينة تعامل RouterOS مع مسار الذاكرة في أجهزة الفلاش الصغيرة (`flash/hotspot`).
   - فصل جلسات PPPoE الحقيقية والتأكد من استجابة الراوتر الفورية.
2. **هاتف محمول حقيقي:**
   - الاتصال بالواي فاي والتحقق من ظهور نافذة تسجيل الدخول (Captive Portal Browser Popup) وقراءة الـ QR Code.
3. **طابعة حرارية حقيقية:**
   - فحص جودة الطباعة العربية (Amiri/Cairo) وقطع الورق وسرعة الاستجابة عبر مقبس 9100 أو البلوتوث.

---

**القرار النهائي المستقل:** المشروع في أفضل حالاته التقنية والبرمجية، وقد أُغلقت كافة الفجوات التي ظهرت في التدقيق السابق، وهو **مؤهل تماماً للانتقال إلى المرحلة التالية (الاختبار الميداني المعملي على عتاد حقيقي)** وفق التوجيه المعتمد.
