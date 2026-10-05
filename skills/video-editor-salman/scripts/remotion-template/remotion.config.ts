import { Config } from '@remotion/cli/config';
/* ⛔ PNG لا JPEG — القاعدة ٢٨. الفريم الوسيط بـJPEG يكلّف ‎−3.0 تشبّع،
   وصاحب المقطع يلاحظها بعينه: «الألوان صارت باهتة». الكلفة مساحة مؤقتة فقط. */
Config.setVideoImageFormat('png');
Config.setChromiumOpenGlRenderer('angle');
