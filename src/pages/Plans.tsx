 import { MainLayout } from "@/components/layout/MainLayout";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import { Check } from "lucide-react";
 
 const plans = [
   {
     name: "Free",
     price: "$0",
     period: "forever",
     description: "Perfect for getting started",
     features: [
       "5 stories per month",
       "Basic AI model",
       "Standard voices",
       "Community support",
     ],
     cta: "Get Started",
     popular: false,
   },
   {
     name: "Premium",
     price: "$9.99",
     period: "/month",
     description: "For regular storytellers",
     features: [
       "Unlimited stories",
       "Advanced AI models",
       "HD voices",
       "Priority support",
       "Custom characters",
       "Early access to features",
     ],
     cta: "Subscribe",
     popular: true,
   },
   {
     name: "Pro",
     price: "$24.99",
     period: "/month",
     description: "For power users",
     features: [
       "Everything in Premium",
       "API access",
       "Custom voice training",
       "Private stories",
       "Commercial usage",
       "Dedicated support",
     ],
     cta: "Go Pro",
     popular: false,
   },
 ];
 
 const Plans = () => {
   return (
     <MainLayout>
       <div className="container mx-auto px-4 py-16">
         <div className="text-center mb-12">
           <h1 className="text-4xl font-display mb-4">Choose Your Plan</h1>
           <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
             Unlock the full potential of interactive storytelling with our flexible plans
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
                     Most Popular
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
           <p className="text-sm text-muted-foreground">
             All plans include a 7-day free trial. Cancel anytime.
           </p>
         </div>
       </div>
     </MainLayout>
   );
 };
 
 export default Plans;