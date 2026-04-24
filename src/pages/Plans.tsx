import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const Plans = () => {
  const { t } = useLanguage();

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
              }`}
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
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
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
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                >
                  {plan.cta}
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