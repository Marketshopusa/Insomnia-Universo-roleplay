import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "en" | "es";

type Dict = Record<string, { en: string; es: string }>;

const translations: Dict = {
  // Header / nav
  "nav.chat": { en: "Chat", es: "Chat" },
  "nav.novelStudio": { en: "Novel Studio", es: "Estudio de Novelas" },
  "nav.myStories": { en: "My Stories", es: "Mis Historias" },
  "nav.plans": { en: "Free & Paid Plans", es: "Planes Gratis y de Pago" },
  "nav.login": { en: "Login", es: "Iniciar Sesión" },
  "nav.logout": { en: "Logout", es: "Cerrar Sesión" },
  "nav.home": { en: "Home", es: "Inicio" },

  // Story Types
  "type.adventure": { en: "Adventure", es: "Aventura" },
  "type.roleplay": { en: "Roleplay", es: "Juego de Roles" },
  "type.realSex": { en: "Real Sex", es: "Sexo Real" },

  // Source
  "source.crafted": { en: "Crafted", es: "Creadas" },
  "source.custom": { en: "Custom", es: "Personalizadas" },

  // Explicit
  "explicit.toggle": { en: "Has Explicit Images", es: "Tiene Imágenes Explícitas" },

  // Chat / cards
  "chat.you": { en: "you", es: "tú" },
  "chat.char": { en: "char", es: "personaje" },
  "chat.videos": { en: "videos", es: "videos" },
  "chat.images": { en: "images", es: "imágenes" },
  "chat.noStories": {
    en: "No stories found with the current filters.",
    es: "No se encontraron historias con los filtros actuales.",
  },

  // Pagination
  "pagination.previous": { en: "Previous", es: "Anterior" },
  "pagination.next": { en: "Next", es: "Siguiente" },
  "pagination.page": { en: "Page", es: "Página" },
  "pagination.of": { en: "of", es: "de" },

  // Story Detail / chat
  "story.startChat": { en: "Start Chat", es: "Iniciar Chat" },
  "story.typeMessage": { en: "Type your message...", es: "Escribe tu mensaje..." },
  "story.send": { en: "Send", es: "Enviar" },
  "story.back": { en: "Back to Stories", es: "Volver a Historias" },
  "story.notFound": { en: "Story not found.", es: "Historia no encontrada." },
  "story.welcome": { en: "Welcome to this story...", es: "Bienvenido a esta historia..." },
  "story.youArePlaying": { en: "You are playing as", es: "Estás interpretando a" },
  "story.iAmPlaying": { en: "I am playing as", es: "Yo interpreto a" },
  "story.sceneSet": {
    en: "The scene is set. What would you like to do?",
    es: "La escena está lista. ¿Qué te gustaría hacer?",
  },

  // Mode selector / narrative
  "mode.choose": { en: "How would you like to experience this story?", es: "¿Cómo quieres vivir esta historia?" },
  "mode.read": { en: "Read full story", es: "Leer relato completo" },
  "mode.readDesc": { en: "AI generates a complete narrative you can read and listen to.", es: "La IA genera un relato completo para leer y escuchar." },
  "mode.roleplay": { en: "Interactive roleplay", es: "Roleplay interactivo" },
  "mode.roleplayDesc": { en: "Chat in character with the AI, turn by turn.", es: "Conversa en personaje con la IA, turno a turno." },
  "mode.generating": { en: "Generating your story...", es: "Generando tu historia..." },
  "mode.regenerate": { en: "Regenerate", es: "Generar de nuevo" },
  "mode.listen": { en: "Listen", es: "Escuchar" },
  "mode.stop": { en: "Stop", es: "Detener" },
  "mode.switchToRoleplay": { en: "Continue in roleplay", es: "Continuar en roleplay" },
  "mode.aiError": { en: "AI is unavailable right now. Please try again.", es: "La IA no está disponible en este momento. Inténtalo de nuevo." },
  "mode.rateLimited": { en: "Too many requests. Please wait a moment.", es: "Demasiadas solicitudes. Espera un momento." },
  "mode.creditsExhausted": { en: "AI credits exhausted. Please add funds.", es: "Créditos de IA agotados. Añade fondos." },

  // Custom stories CTA
  "custom.empty.title": { en: "Create your own story", es: "Crea tu propia historia" },
  "custom.empty.desc": { en: "Use the Studio to design your fantasy: pick the model, the language, the chapters, and let the AI write it for you.", es: "Usa el Studio para diseñar tu fantasía: elige el modelo, el idioma, los capítulos y deja que la IA la escriba por ti." },
  "custom.empty.cta": { en: "Open Studio", es: "Abrir Studio" },

  // Audio Settings
  "audio.title": { en: "Audio Settings", es: "Configuración de Audio" },
  "audio.voice": { en: "Voice", es: "Voz" },
  "audio.muted": { en: "Muted", es: "Silenciado" },
  "audio.autoplay": { en: "Autoplay", es: "Reproducción Automática" },
  "audio.gender": { en: "Gender", es: "Género" },
  "audio.style": { en: "Style", es: "Estilo" },
  "audio.per10k": { en: "per 10k chars", es: "por 10k caracteres" },

  // Common
  "common.all": { en: "All", es: "Todos" },
  "common.female": { en: "Female", es: "Mujer" },
  "common.male": { en: "Male", es: "Hombre" },
  "common.cancel": { en: "Cancel", es: "Cancelar" },
  "common.save": { en: "Save", es: "Guardar" },
  "common.delete": { en: "Delete", es: "Eliminar" },
  "common.create": { en: "Create", es: "Crear" },
  "common.creating": { en: "Creating...", es: "Creando..." },
  "common.saving": { en: "Saving...", es: "Guardando..." },
  "common.loading": { en: "Loading...", es: "Cargando..." },
  "common.error": { en: "Error", es: "Error" },

  // Voice styles/tags
  "style.gentle": { en: "Gentle", es: "Suave" },
  "style.confident": { en: "Confident", es: "Seguro" },
  "style.playful": { en: "Playful", es: "Juguetón" },
  "tag.gentle": { en: "gentle", es: "suave" },
  "tag.elegant": { en: "elegant", es: "elegante" },
  "tag.deep": { en: "deep", es: "grave" },
  "tag.confident": { en: "confident", es: "seguro" },
  "tag.sweet": { en: "sweet", es: "dulce" },
  "tag.playful": { en: "playful", es: "juguetón" },
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
  "notFound.message": { en: "Oops! Page not found", es: "¡Ups! Página no encontrada" },
  "notFound.returnHome": { en: "Return to Home", es: "Volver al Inicio" },

  // Footer
  "footer.copyright": { en: "© 2025 Erota", es: "© 2025 Erota" },

  // Studio
  "studio.title": { en: "Novel Studio", es: "Estudio de Novelas" },
  "studio.loginRequired": { en: "Please log in to use the Novel Studio", es: "Inicia sesión para usar el Estudio de Novelas" },
  "studio.aiSection": { en: "AI", es: "IA" },
  "studio.model": { en: "Model", es: "Modelo" },
  "studio.creativity": { en: "Creativity", es: "Creatividad" },
  "studio.creativity.conservative": { en: "Conservative", es: "Conservadora" },
  "studio.creativity.balanced": { en: "Balanced", es: "Equilibrada" },
  "studio.creativity.creative": { en: "Creative", es: "Creativa" },
  "studio.creativity.wild": { en: "Wild", es: "Salvaje" },
  "studio.description": { en: "Description", es: "Descripción" },
  "studio.descriptionPlaceholder": {
    en: "Two women and a man explore ...",
    es: "Dos mujeres y un hombre exploran ...",
  },
  "studio.numChapters": { en: "Number of Chapters", es: "Número de Capítulos" },
  "studio.safeForWork": { en: "Safe for Work", es: "Apto para el Trabajo" },
  "studio.language": { en: "Language", es: "Idioma" },
  "studio.writeNovel": { en: "Write Novel", es: "Escribir Novela" },
  "studio.writeOutline": { en: "Write Outline", es: "Escribir Guion" },
  "studio.blankNovel": { en: "Blank Novel", es: "Novela en Blanco" },
  "studio.saveProject": { en: "Save Project", es: "Guardar Proyecto" },
  "studio.loadProject": { en: "Load Project", es: "Cargar Proyecto" },
  "studio.deleteProjects": { en: "Delete Projects", es: "Eliminar Proyectos" },
  "studio.downloadProject": { en: "Download Project", es: "Descargar Proyecto" },
  "studio.uploadProject": { en: "Upload Project", es: "Subir Proyecto" },
  "studio.reset": { en: "Reset", es: "Restablecer" },
  "studio.deleteAllTitle": { en: "Delete All Projects?", es: "¿Eliminar Todos los Proyectos?" },
  "studio.deleteAllDesc": {
    en: "This action cannot be undone. All your saved projects will be permanently deleted.",
    es: "Esta acción no se puede deshacer. Todos tus proyectos guardados se eliminarán permanentemente.",
  },
  "studio.noSavedProjects": { en: "No saved projects found", es: "No hay proyectos guardados" },
  "studio.loadingProjects": { en: "Loading projects...", es: "Cargando proyectos..." },
  "studio.toast.loginToCreate": { en: "Please login to create novels", es: "Inicia sesión para crear novelas" },
  "studio.toast.generating": { en: "Generating novel...", es: "Generando novela..." },
  "studio.toast.generatingDesc": { en: "This may take a few moments", es: "Esto puede tardar unos momentos" },
  "studio.toast.generated": { en: "Novel generated!", es: "¡Novela generada!" },
  "studio.toast.generatedDesc": { en: "Your novel has been created", es: "Tu novela ha sido creada" },
  "studio.toast.outline": { en: "Generating outline...", es: "Generando guion..." },
  "studio.toast.outlineDesc": { en: "Creating chapter structure", es: "Creando estructura de capítulos" },
  "studio.toast.blank": { en: "New blank novel created", es: "Nueva novela en blanco creada" },
  "studio.toast.loginToSave": { en: "Please login to save projects", es: "Inicia sesión para guardar proyectos" },
  "studio.toast.saved": { en: "Project saved!", es: "¡Proyecto guardado!" },
  "studio.toast.created": { en: "Project created!", es: "¡Proyecto creado!" },
  "studio.toast.saveError": { en: "Error saving project", es: "Error al guardar el proyecto" },
  "studio.toast.loaded": { en: "Project loaded", es: "Proyecto cargado" },
  "studio.toast.allDeleted": { en: "All projects deleted", es: "Todos los proyectos eliminados" },
  "studio.toast.reset": { en: "Settings reset", es: "Ajustes restablecidos" },

  // My Stories
  "myStories.title": { en: "Past Stories", es: "Historias Anteriores" },
  "myStories.loginRequired": { en: "Login Required", es: "Inicio de Sesión Requerido" },
  "myStories.loginMessage": { en: "Please log in to view your stories.", es: "Inicia sesión para ver tus historias." },
  "myStories.newStory": { en: "New Story", es: "Nueva Historia" },
  "myStories.createNew": { en: "Create New Story", es: "Crear Nueva Historia" },
  "myStories.titlePlaceholder": { en: "Story title", es: "Título de la historia" },
  "myStories.contentPlaceholder": { en: "Write your story...", es: "Escribe tu historia..." },
  "myStories.empty": { en: "You haven't created any stories yet.", es: "Aún no has creado ninguna historia." },
  "myStories.createFirst": { en: "Create Your First Story", es: "Crea Tu Primera Historia" },
  "myStories.deleteTitle": { en: "Delete Story?", es: "¿Eliminar Historia?" },
  "myStories.deleteDesc": { en: "This action cannot be undone.", es: "Esta acción no se puede deshacer." },
  "myStories.toast.needTitle": { en: "Please enter a title", es: "Por favor ingresa un título" },
  "myStories.toast.created": { en: "Story created!", es: "¡Historia creada!" },
  "myStories.toast.updated": { en: "Story updated!", es: "¡Historia actualizada!" },
  "myStories.toast.deleted": { en: "Story deleted", es: "Historia eliminada" },
  "myStories.toast.createError": { en: "Error creating story", es: "Error al crear la historia" },
  "myStories.toast.updateError": { en: "Error updating story", es: "Error al actualizar la historia" },
  "myStories.toast.deleteError": { en: "Error deleting story", es: "Error al eliminar la historia" },
  "myStories.loading": { en: "Loading stories...", es: "Cargando historias..." },

  // Plans
  "plans.title": { en: "Choose Your Plan", es: "Elige Tu Plan" },
  "plans.subtitle": {
    en: "Unlock the full potential of interactive storytelling with our flexible plans",
    es: "Desbloquea todo el potencial de las historias interactivas con nuestros planes flexibles",
  },
  "plans.popular": { en: "Most Popular", es: "Más Popular" },
  "plans.trial": { en: "All plans include a 7-day free trial. Cancel anytime.", es: "Todos los planes incluyen 7 días gratis. Cancela cuando quieras." },
  "plans.free": { en: "Free", es: "Gratis" },
  "plans.free.period": { en: "forever", es: "para siempre" },
  "plans.free.desc": { en: "Perfect for getting started", es: "Perfecto para empezar" },
  "plans.free.cta": { en: "Get Started", es: "Empezar" },
  "plans.free.f1": { en: "5 stories per month", es: "5 historias al mes" },
  "plans.free.f2": { en: "Basic AI model", es: "Modelo de IA básico" },
  "plans.free.f3": { en: "Standard voices", es: "Voces estándar" },
  "plans.free.f4": { en: "Community support", es: "Soporte de la comunidad" },
  "plans.premium": { en: "Premium", es: "Premium" },
  "plans.premium.period": { en: "/month", es: "/mes" },
  "plans.premium.desc": { en: "For regular storytellers", es: "Para narradores frecuentes" },
  "plans.premium.cta": { en: "Subscribe", es: "Suscribirse" },
  "plans.premium.f1": { en: "Unlimited stories", es: "Historias ilimitadas" },
  "plans.premium.f2": { en: "Advanced AI models", es: "Modelos de IA avanzados" },
  "plans.premium.f3": { en: "HD voices", es: "Voces HD" },
  "plans.premium.f4": { en: "Priority support", es: "Soporte prioritario" },
  "plans.premium.f5": { en: "Custom characters", es: "Personajes personalizados" },
  "plans.premium.f6": { en: "Early access to features", es: "Acceso anticipado a funciones" },
  "plans.pro": { en: "Pro", es: "Pro" },
  "plans.pro.desc": { en: "For power users", es: "Para usuarios avanzados" },
  "plans.pro.cta": { en: "Go Pro", es: "Hazte Pro" },
  "plans.pro.f1": { en: "Everything in Premium", es: "Todo lo de Premium" },
  "plans.pro.f2": { en: "API access", es: "Acceso a la API" },
  "plans.pro.f3": { en: "Custom voice training", es: "Entrenamiento de voz personalizado" },
  "plans.pro.f4": { en: "Private stories", es: "Historias privadas" },
  "plans.pro.f5": { en: "Commercial usage", es: "Uso comercial" },
  "plans.pro.f6": { en: "Dedicated support", es: "Soporte dedicado" },

  // Auth
  "auth.welcomeBack": { en: "Welcome Back", es: "Bienvenido de Nuevo" },
  "auth.signInDesc": { en: "Sign in to your account to continue", es: "Inicia sesión en tu cuenta para continuar" },
  "auth.email": { en: "Email", es: "Correo" },
  "auth.password": { en: "Password", es: "Contraseña" },
  "auth.username": { en: "Username", es: "Nombre de Usuario" },
  "auth.usernamePlaceholder": { en: "Your username", es: "Tu nombre de usuario" },
  "auth.signIn": { en: "Sign In", es: "Iniciar Sesión" },
  "auth.signingIn": { en: "Signing in...", es: "Iniciando sesión..." },
  "auth.noAccount": { en: "Don't have an account?", es: "¿No tienes cuenta?" },
  "auth.signUp": { en: "Sign up", es: "Regístrate" },
  "auth.createAccount": { en: "Create Account", es: "Crear Cuenta" },
  "auth.signUpDesc": { en: "Sign up to get started with Erota", es: "Regístrate para comenzar con Erota" },
  "auth.signUpBtn": { en: "Sign Up", es: "Registrarse" },
  "auth.creatingAccount": { en: "Creating account...", es: "Creando cuenta..." },
  "auth.haveAccount": { en: "Already have an account?", es: "¿Ya tienes cuenta?" },
  "auth.signInLink": { en: "Sign in", es: "Inicia sesión" },
  "auth.welcomeToast": { en: "Welcome back!", es: "¡Bienvenido de nuevo!" },
  "auth.welcomeToastDesc": { en: "You have successfully logged in.", es: "Has iniciado sesión correctamente." },
  "auth.accountCreated": { en: "Account created!", es: "¡Cuenta creada!" },
  "auth.accountCreatedDesc": { en: "Please check your email to verify your account.", es: "Revisa tu correo para verificar tu cuenta." },

  // Adult mode
  "adult.title": { en: "Adult Content (18+)", es: "Contenido para Adultos (18+)" },
  "adult.intro": {
    en: "This section contains explicit erotic content (NSFW). To access it, you must give your informed consent.",
    es: "Esta sección contiene contenido erótico explícito (NSFW). Para acceder, debes dar tu consentimiento informado.",
  },
  "adult.requirements": {
    en: "By continuing you confirm that:",
    es: "Al continuar confirmas que:",
  },
  "adult.req1": {
    en: "You are at least 18 years old (or the legal age in your country).",
    es: "Tienes al menos 18 años (o la edad legal en tu país).",
  },
  "adult.req2": {
    en: "You are voluntarily seeking explicit material — it is not being imposed on you.",
    es: "Buscas material explícito de forma voluntaria — no se te está imponiendo.",
  },
  "adult.req3": {
    en: "Such content is legal in your jurisdiction.",
    es: "Este contenido es legal en tu jurisdicción.",
  },
  "adult.req4": {
    en: "You will not show this content to minors.",
    es: "No mostrarás este contenido a menores de edad.",
  },
  "adult.disclaimer": {
    en: "All characters are fictional adults over 18. You can disable adult mode anytime from the header.",
    es: "Todos los personajes son adultos ficticios mayores de 18 años. Puedes desactivar el modo adulto en cualquier momento desde la cabecera.",
  },
  "adult.accept": { en: "I am 18+ and I consent", es: "Tengo 18+ y consiento" },
  "adult.decline": { en: "Cancel", es: "Cancelar" },
  "adult.enable": { en: "Enable Adult Mode", es: "Activar Modo Adulto" },
  "adult.disable": { en: "Disable Adult Mode", es: "Desactivar Modo Adulto" },
  "adult.on": { en: "Adult Mode: ON", es: "Modo Adulto: ON" },
  "adult.off": { en: "Adult Mode: OFF", es: "Modo Adulto: OFF" },
  "adult.gateTitle": { en: "Adult Mode Required", es: "Se Requiere Modo Adulto" },
  "adult.gateDesc": {
    en: "This category contains explicit content. Enable Adult Mode to view it.",
    es: "Esta categoría contiene contenido explícito. Activa el Modo Adulto para verla.",
  },

  // Auth gate
  "authGate.title": { en: "Sign in required", es: "Inicio de sesión requerido" },
  "authGate.desc": {
    en: "Create a free account or sign in to read and create stories.",
    es: "Crea una cuenta gratis o inicia sesión para leer y crear historias.",
  },
  "authGate.signIn": { en: "Sign In", es: "Iniciar Sesión" },
  "authGate.signUp": { en: "Sign Up", es: "Registrarse" },
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
];

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("language");
    return saved === "es" ? "es" : "en";
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("language", lang);
  };

  const t = (key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] || entry.en;
  };

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage: handleSetLanguage, t, availableLanguages }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
};