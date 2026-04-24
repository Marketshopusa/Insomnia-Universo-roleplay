import { useLanguage } from "@/contexts/LanguageContext";

export const Footer = () => {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-border py-6 mt-auto">
      <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
        {t("footer.copyright")}
      </div>
    </footer>
  );
};