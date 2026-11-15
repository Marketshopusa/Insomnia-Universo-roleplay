import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

export const ReadingHistory = () => {
  const { language } = useLanguage();
  return <MainLayout><div className="container mx-auto px-4 py-16 text-center space-y-4">
    <h1 className="text-3xl font-display">{language === "es" ? "Conversaciones sin historial guardado" : "Conversations without saved history"}</h1>
    <p className="text-muted-foreground">{language === "es" ? "Cada vez que abres o reinicias una conversación, empiezas desde cero. Los mensajes no se guardan para recuperarlos después." : "Every time you open or reset a conversation, you start from zero. Messages are not saved for later recovery."}</p>
    <Link to="/"><Button>{language === "es" ? "Explorar historias" : "Explore stories"}</Button></Link>
  </div></MainLayout>;
};
export default ReadingHistory;
