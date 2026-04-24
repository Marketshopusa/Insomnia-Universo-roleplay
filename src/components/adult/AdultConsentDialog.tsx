import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { ShieldAlert } from "lucide-react";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const AdultConsentDialog = ({ open, onConfirm, onCancel }: Props) => {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl">
              {t("adult.title")}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-3">
            <span className="block">{t("adult.intro")}</span>
            <span className="block text-foreground font-medium">{t("adult.requirements")}</span>
            <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              <li>{t("adult.req1")}</li>
              <li>{t("adult.req2")}</li>
              <li>{t("adult.req3")}</li>
              <li>{t("adult.req4")}</li>
            </ul>
            <span className="block text-xs text-muted-foreground pt-2 border-t border-border">
              {t("adult.disclaimer")}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t("adult.decline")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-primary">
            {t("adult.accept")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};