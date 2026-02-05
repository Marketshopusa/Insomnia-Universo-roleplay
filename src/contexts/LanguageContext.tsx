 import { createContext, useContext, useState, ReactNode } from "react";
 
 type Language = "en" | "es" | "fr" | "de" | "pt" | "it" | "ru" | "ja" | "zh" | "ko";
 
  interface Translations {
    [key: string]: {
      [lang in Language]?: string;
    };
  }
 
 const translations: Translations = {
   // Header
   "nav.chat": {
     en: "Chat",
     es: "Chat",
     fr: "Chat",
     de: "Chat",
     pt: "Chat",
     it: "Chat",
     ru: "Чат",
     ja: "チャット",
     zh: "聊天",
     ko: "채팅",
   },
   "nav.novelStudio": {
     en: "Novel Studio",
     es: "Estudio de Novelas",
     fr: "Studio Roman",
     de: "Roman Studio",
     pt: "Estúdio de Romances",
     it: "Studio Romanzo",
     ru: "Студия Романов",
     ja: "ノベルスタジオ",
     zh: "小说工作室",
     ko: "소설 스튜디오",
   },
   "nav.myStories": {
     en: "My Stories",
     es: "Mis Historias",
     fr: "Mes Histoires",
     de: "Meine Geschichten",
     pt: "Minhas Histórias",
     it: "Le Mie Storie",
     ru: "Мои Истории",
     ja: "マイストーリー",
     zh: "我的故事",
     ko: "내 이야기",
   },
   "nav.plans": {
     en: "Free & Paid Plans",
     es: "Planes Gratis y de Pago",
     fr: "Plans Gratuits et Payants",
     de: "Kostenlose & Bezahlte Pläne",
     pt: "Planos Grátis e Pagos",
     it: "Piani Gratis e a Pagamento",
     ru: "Бесплатные и Платные Планы",
     ja: "無料＆有料プラン",
     zh: "免费和付费计划",
     ko: "무료 및 유료 요금제",
   },
   "nav.login": {
     en: "Login",
     es: "Iniciar Sesión",
     fr: "Connexion",
     de: "Anmelden",
     pt: "Entrar",
     it: "Accedi",
     ru: "Вход",
     ja: "ログイン",
     zh: "登录",
     ko: "로그인",
   },
   "nav.logout": {
     en: "Logout",
     es: "Cerrar Sesión",
     fr: "Déconnexion",
     de: "Abmelden",
     pt: "Sair",
     it: "Esci",
     ru: "Выход",
     ja: "ログアウト",
     zh: "登出",
     ko: "로그아웃",
   },
    "nav.home": {
      en: "Home",
      es: "Inicio",
    },
   // Story Types
   "type.adventure": {
     en: "Adventure",
     es: "Aventura",
     fr: "Aventure",
     de: "Abenteuer",
     pt: "Aventura",
     it: "Avventura",
     ru: "Приключение",
     ja: "アドベンチャー",
     zh: "冒险",
     ko: "모험",
   },
   "type.roleplay": {
     en: "Roleplay",
     es: "Juego de Roles",
     fr: "Jeu de Rôle",
     de: "Rollenspiel",
     pt: "Roleplay",
     it: "Gioco di Ruolo",
     ru: "Ролевая игра",
     ja: "ロールプレイ",
     zh: "角色扮演",
     ko: "롤플레이",
   },
   "type.realSex": {
     en: "Real Sex",
     es: "Sexo Real",
     fr: "Sexe Réel",
     de: "Echter Sex",
     pt: "Sexo Real",
     it: "Sesso Reale",
     ru: "Реальный Секс",
     ja: "リアルセックス",
     zh: "真实性爱",
     ko: "리얼 섹스",
   },
   // Source
   "source.crafted": {
     en: "Crafted",
     es: "Creadas",
     fr: "Créées",
     de: "Erstellt",
     pt: "Criadas",
     it: "Create",
     ru: "Созданные",
     ja: "作成済み",
     zh: "精选",
     ko: "제작됨",
   },
   "source.custom": {
     en: "Custom",
     es: "Personalizadas",
     fr: "Personnalisées",
     de: "Benutzerdefiniert",
     pt: "Personalizadas",
     it: "Personalizzate",
     ru: "Пользовательские",
     ja: "カスタム",
     zh: "自定义",
     ko: "커스텀",
   },
   // Explicit
   "explicit.toggle": {
     en: "Has Explicit Images",
     es: "Tiene Imágenes Explícitas",
     fr: "Contient des Images Explicites",
     de: "Enthält Explizite Bilder",
     pt: "Tem Imagens Explícitas",
     it: "Contiene Immagini Esplicite",
     ru: "Содержит Откровенные Изображения",
     ja: "過激な画像を含む",
     zh: "包含露骨图片",
     ko: "노골적인 이미지 포함",
   },
   // Chat
   "chat.you": {
     en: "you",
     es: "tú",
     fr: "vous",
     de: "du",
     pt: "você",
     it: "tu",
     ru: "вы",
     ja: "あなた",
     zh: "你",
     ko: "당신",
   },
   "chat.char": {
     en: "char",
     es: "personaje",
     fr: "perso",
     de: "char",
     pt: "personagem",
     it: "personaggio",
     ru: "персонаж",
     ja: "キャラ",
     zh: "角色",
     ko: "캐릭터",
   },
   "chat.videos": {
     en: "videos",
     es: "videos",
     fr: "vidéos",
     de: "Videos",
     pt: "vídeos",
     it: "video",
     ru: "видео",
     ja: "動画",
     zh: "视频",
     ko: "동영상",
   },
   "chat.images": {
     en: "images",
     es: "imágenes",
     fr: "images",
     de: "Bilder",
     pt: "imagens",
     it: "immagini",
     ru: "изображения",
     ja: "画像",
     zh: "图片",
     ko: "이미지",
   },
   "chat.noStories": {
     en: "No stories found with the current filters.",
     es: "No se encontraron historias con los filtros actuales.",
     fr: "Aucune histoire trouvée avec les filtres actuels.",
     de: "Keine Geschichten mit den aktuellen Filtern gefunden.",
     pt: "Nenhuma história encontrada com os filtros atuais.",
     it: "Nessuna storia trovata con i filtri attuali.",
     ru: "Истории не найдены с текущими фильтрами.",
     ja: "現在のフィルターでストーリーが見つかりませんでした。",
     zh: "未找到符合当前筛选条件的故事。",
     ko: "현재 필터로 이야기를 찾을 수 없습니다.",
   },
   // Pagination
   "pagination.previous": {
     en: "Previous",
     es: "Anterior",
     fr: "Précédent",
     de: "Zurück",
     pt: "Anterior",
     it: "Precedente",
     ru: "Назад",
     ja: "前へ",
     zh: "上一页",
     ko: "이전",
   },
   "pagination.next": {
     en: "Next",
     es: "Siguiente",
     fr: "Suivant",
     de: "Weiter",
     pt: "Próximo",
     it: "Successivo",
     ru: "Далее",
     ja: "次へ",
     zh: "下一页",
     ko: "다음",
   },
   "pagination.page": {
     en: "Page",
     es: "Página",
     fr: "Page",
     de: "Seite",
     pt: "Página",
     it: "Pagina",
     ru: "Страница",
     ja: "ページ",
     zh: "页",
     ko: "페이지",
   },
   "pagination.of": {
     en: "of",
     es: "de",
     fr: "sur",
     de: "von",
     pt: "de",
     it: "di",
     ru: "из",
     ja: "/",
     zh: "/",
     ko: "/",
   },
   // Story Detail
   "story.startChat": {
     en: "Start Chat",
     es: "Iniciar Chat",
     fr: "Démarrer le Chat",
     de: "Chat Starten",
     pt: "Iniciar Chat",
     it: "Inizia Chat",
     ru: "Начать Чат",
     ja: "チャットを開始",
     zh: "开始聊天",
     ko: "채팅 시작",
   },
   "story.typeMessage": {
     en: "Type your message...",
     es: "Escribe tu mensaje...",
     fr: "Écrivez votre message...",
     de: "Schreibe deine Nachricht...",
     pt: "Digite sua mensagem...",
     it: "Scrivi il tuo messaggio...",
     ru: "Введите сообщение...",
     ja: "メッセージを入力...",
     zh: "输入你的消息...",
     ko: "메시지를 입력하세요...",
   },
   "story.send": {
     en: "Send",
     es: "Enviar",
     fr: "Envoyer",
     de: "Senden",
     pt: "Enviar",
     it: "Invia",
     ru: "Отправить",
     ja: "送信",
     zh: "发送",
     ko: "보내기",
   },
   "story.back": {
     en: "Back to Stories",
     es: "Volver a Historias",
     fr: "Retour aux Histoires",
     de: "Zurück zu Geschichten",
     pt: "Voltar às Histórias",
     it: "Torna alle Storie",
     ru: "Назад к Историям",
     ja: "ストーリー一覧に戻る",
     zh: "返回故事列表",
     ko: "이야기 목록으로 돌아가기",
   },
   // Audio Settings
   "audio.title": {
     en: "Audio Settings",
     es: "Configuración de Audio",
     fr: "Paramètres Audio",
     de: "Audio-Einstellungen",
     pt: "Configurações de Áudio",
     it: "Impostazioni Audio",
     ru: "Настройки Аудио",
     ja: "オーディオ設定",
     zh: "音频设置",
     ko: "오디오 설정",
   },
   "audio.voice": {
     en: "Voice",
     es: "Voz",
     fr: "Voix",
     de: "Stimme",
     pt: "Voz",
     it: "Voce",
     ru: "Голос",
     ja: "声",
     zh: "声音",
     ko: "음성",
   },
   "audio.muted": {
     en: "Muted",
     es: "Silenciado",
     fr: "Muet",
     de: "Stumm",
     pt: "Mudo",
     it: "Muto",
     ru: "Без звука",
     ja: "ミュート",
     zh: "静音",
     ko: "음소거",
   },
   "audio.autoplay": {
     en: "Autoplay",
     es: "Reproducción Automática",
     fr: "Lecture Automatique",
     de: "Automatische Wiedergabe",
     pt: "Reprodução Automática",
     it: "Riproduzione Automatica",
     ru: "Автовоспроизведение",
     ja: "自動再生",
     zh: "自动播放",
     ko: "자동재생",
   },

    // Common
    "common.all": {
      en: "All",
      es: "Todos",
    },
    "common.female": {
      en: "Female",
      es: "Mujer",
    },
    "common.male": {
      en: "Male",
      es: "Hombre",
    },

    // Audio extra
    "audio.gender": {
      en: "Gender",
      es: "Género",
    },
    "audio.style": {
      en: "Style",
      es: "Estilo",
    },
    "audio.per10k": {
      en: "per 10k chars",
      es: "por 10k caracteres",
    },

    // Voice styles/tags
    "style.gentle": {
      en: "Gentle",
      es: "Suave",
    },
    "style.confident": {
      en: "Confident",
      es: "Seguro",
    },
    "style.playful": {
      en: "Playful",
      es: "Juguetón",
    },
    "tag.gentle": {
      en: "gentle",
      es: "suave",
    },
    "tag.elegant": {
      en: "elegant",
      es: "elegante",
    },
    "tag.deep": {
      en: "deep",
      es: "grave",
    },
    "tag.confident": {
      en: "confident",
      es: "seguro",
    },
    "tag.sweet": {
      en: "sweet",
      es: "dulce",
    },
    "tag.playful": {
      en: "playful",
      es: "juguetón",
    },

    // Voice descriptions
    "voice.scarlettHd.desc": {
      en: "A soft, gentle female voice with elegance",
      es: "Una voz femenina suave y delicada, con elegancia",
    },
    "voice.maxDeep.desc": {
      en: "A deep, confident male voice",
      es: "Una voz masculina grave y segura",
    },
    "voice.lunaSweet.desc": {
      en: "A sweet, playful female voice",
      es: "Una voz femenina dulce y juguetona",
    },

    // Not Found
    "notFound.message": {
      en: "Oops! Page not found",
      es: "¡Ups! Página no encontrada",
    },
    "notFound.returnHome": {
      en: "Return to Home",
      es: "Volver al inicio",
    },
 };
 
 interface LanguageContextType {
   language: Language;
   setLanguage: (lang: Language) => void;
   t: (key: string) => string;
   availableLanguages: { code: Language; name: string; flag: string }[];
 }
 
 const availableLanguages: { code: Language; name: string; flag: string }[] = [
   { code: "en", name: "English", flag: "🇺🇸" },
   { code: "es", name: "Español", flag: "🇪🇸" },
   { code: "fr", name: "Français", flag: "🇫🇷" },
   { code: "de", name: "Deutsch", flag: "🇩🇪" },
   { code: "pt", name: "Português", flag: "🇧🇷" },
   { code: "it", name: "Italiano", flag: "🇮🇹" },
   { code: "ru", name: "Русский", flag: "🇷🇺" },
   { code: "ja", name: "日本語", flag: "🇯🇵" },
   { code: "zh", name: "中文", flag: "🇨🇳" },
   { code: "ko", name: "한국어", flag: "🇰🇷" },
 ];
 
 const LanguageContext = createContext<LanguageContextType | null>(null);
 
 export const LanguageProvider = ({ children }: { children: ReactNode }) => {
   const [language, setLanguage] = useState<Language>(() => {
     const saved = localStorage.getItem("language");
     return (saved as Language) || "en";
   });
 
   const handleSetLanguage = (lang: Language) => {
     setLanguage(lang);
     localStorage.setItem("language", lang);
   };
 
   const t = (key: string): string => {
     return translations[key]?.[language] || translations[key]?.en || key;
   };
 
   return (
     <LanguageContext.Provider
       value={{
         language,
         setLanguage: handleSetLanguage,
         t,
         availableLanguages,
       }}
     >
       {children}
     </LanguageContext.Provider>
   );
 };
 
 export const useLanguage = () => {
   const context = useContext(LanguageContext);
   if (!context) {
     throw new Error("useLanguage must be used within a LanguageProvider");
   }
   return context;
 };