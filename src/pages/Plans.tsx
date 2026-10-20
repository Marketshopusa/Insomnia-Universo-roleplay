import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check, Crown, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

const Plans = () => {
  const { t, language } = useLanguage();
  const isEs = language === "es";
  const { isAdmin, adminEmail } = useAuth();

  const plans = [
    {
      name: t("plans.free"),
      price: "$0",
      period: t("plans.free.period"),
      description: t("plans.free.desc"),
      features: [
        t("plans.free.f1"),
        t("plans.free.f2"),
        t("plans.free.f3"),
        t("plans.free.f4"),
      ],
      cta: t("plans.free.cta"),
      popular: false,
    },
    {
      name: t("plans.premium"),
      price: "$9.99",
      period: t("plans.premium.period"),
      description: t("plans.premium.desc"),
      features: [
        t("plans.premium.f1"),
        t("plans.premium.f2"),
        t("plans.premium.f3"),
        t("plans.premium.f4"),
        t("plans.premium.f5"),
        t("plans.premium.f6"),
      ],
      cta: t("plans.premium.cta"),
      popular: true,
    },
    {
      name: t("plans.pro"),
      price: "$24.99",
      period: t("plans.premium.period"),
      description: t("plans.pro.desc"),
      features: [
        t("plans.pro.f1"),
        t("plans.pro.f2"),
        t("plans.pro.f3"),
        t("plans.pro.f4"),
        t("plans.pro.f5"),
        t("plans.pro.f6"),
      ],
      cta: t("plans.pro.cta"),
      popular: false,
    },
  ];

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-16">
        {/* Administrator Access Banner */}
        {isAdmin && (
          <div className="mb-10 max-w-4xl mx-auto p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-yellow-950/30 to-amber-950/40 border-2 border-amber-500/60 shadow-2xl shadow-amber-950/40 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Crown className="w-6 h-6 fill-amber-400" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500 text-black">
                  {isEs ? "Acceso Maestro Administrador" : "Master Admin Access"}
                </span>
                <span className="text-xs font-semibold text-amber-300">
                  {adminEmail}
                </span>
              </div>
              <h3 className="text-base font-bold text-white">
                {isEs ? "Todos los Modelos Premium & Deluxe Están Desbloqueados" : "All Premium & Deluxe Models Are 100% Unlocked"}
              </h3>
              <p className="text-xs text-neutral-300 leading-relaxed">
                {isEs
                  ? "Como administrador de Insomnia Universo, tienes acceso ilimitado y gratuito a Magnum v4, Euryale 70B, DeepSeek V4, memoria masiva de 32K tokens, generación de videos en Shorts y todo el catálogo sin restricciones."
                  : "As Insomnia Universo administrator, you have unlimited free access to Magnum v4, Euryale 70B, DeepSeek V4, 32K memory tier, Shorts video production, and the full catalog without restrictions."}
              </p>
            </div>
          </div>
        )}

        <div className="text-center mb-12">
          <h1 className="text-4xl font-display mb-4">{t("plans.title")}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("plans.subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative ${
                plan.popular ? "border-primary shadow-lg shadow-primary/20" : ""
              } ${isAdmin ? "border-amber-500/40" : ""}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                    {t("plans.popular")}
                  </span>
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{isAdmin ? "$0 (Admin)" : plan.price}</span>
                  <span className="text-muted-foreground">{isAdmin ? " / Permanente" : plan.period}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full font-bold ${
                    isAdmin
                      ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:opacity-90 shadow-lg shadow-amber-500/20"
                      : plan.popular
                      ? "default"
                      : "outline"
                  }`}
                  disabled={isAdmin}
                >
                  {isAdmin ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Crown className="w-4 h-4 fill-black" />
                      {isEs ? "Desbloqueado (Admin)" : "Unlocked (Admin)"}
                    </span>
                  ) : (
                    plan.cta
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground">{t("plans.trial")}</p>
        </div>
      </div>
    </MainLayout>
  );
};

export default Plans;
