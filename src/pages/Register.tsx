import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signUp } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layout/MainLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { ShieldAlert } from "lucide-react";

export const calculateAgeFromBirthdate = (birthDateString: string): number => {
  if (!birthDateString) return 0;
  const today = new Date();
  const birth = new Date(birthDateString);
  if (isNaN(birth.getTime())) return 0;
  let calculated = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    calculated--;
  }
  return calculated;
};

const Register = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [age, setAge] = useState<string>("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const es = language === "es";

  // Fecha máxima permitida (hace exactamente 18 años)
  const maxBirthDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split("T")[0];
  })();

  const handleBirthDateChange = (val: string) => {
    setBirthDate(val);
    if (val) {
      const calc = calculateAgeFromBirthdate(val);
      if (calc > 0) {
        setAge(String(calc));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!birthDate) {
      toast({
        title: es ? "Fecha requerida" : "Birth date required",
        description: es ? "Ingresa tu fecha de nacimiento completa." : "Enter your full date of birth.",
        variant: "destructive",
      });
      return;
    }

    const calculated = calculateAgeFromBirthdate(birthDate);
    const numAge = parseInt(age, 10);

    if (calculated < 18 || isNaN(numAge) || numAge < 18) {
      toast({
        title: es ? "Acceso denegado (+18)" : "Access Denied (18+)",
        description: es
          ? "Esta plataforma contiene contenido exclusivo para adultos. Debes tener 18 años o más para registrarte."
          : "This platform is exclusively for adults. You must be at least 18 years old to register.",
        variant: "destructive",
      });
      return;
    }

    if (Math.abs(calculated - numAge) > 1) {
      toast({
        title: es ? "Inconsistencia de edad" : "Age mismatch",
        description: es
          ? "La edad ingresada no coincide con la fecha de nacimiento indicada."
          : "The entered age does not match the provided birth date.",
        variant: "destructive",
      });
      return;
    }

    if (!adultConfirmed) {
      toast({
        title: es ? "Declaración jurada obligatoria" : "Confirmation required",
        description: es
          ? "Debes confirmar que eres mayor de 18 años y aceptas las condiciones de contenido para adultos."
          : "You must confirm you are over 18 years of age.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(email, password, username, {
        birthDate,
        age: numAge,
      });

      if (error) {
        toast({
          title: t("common.error"),
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: t("auth.accountCreated"),
          description: t("auth.accountCreatedDesc"),
        });
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex min-h-[85vh] items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md border-border bg-card shadow-2xl">
          <CardHeader className="text-center space-y-1">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-950/60 border border-rose-800/40 text-rose-400 mb-2">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-display">{t("auth.createAccount")}</CardTitle>
            <CardDescription>
              {es
                ? "Plataforma exclusiva para mayores de edad (+18)"
                : "Adults only platform (18+)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t("auth.username")}</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder={t("auth.usernamePlaceholder")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {/* Parámetros de Seguridad: Fecha de nacimiento y Edad (+18) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="birthdate" className="text-xs font-semibold text-rose-300">
                    {es ? "Fecha de Nacimiento *" : "Birth Date *"}
                  </Label>
                  <Input
                    id="birthdate"
                    type="date"
                    max={maxBirthDate}
                    value={birthDate}
                    onChange={(e) => handleBirthDateChange(e.target.value)}
                    required
                    className="border-rose-900/40 bg-background text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="age" className="text-xs font-semibold text-rose-300">
                    {es ? "Edad (Mín. 18) *" : "Age (Min. 18) *"}
                  </Label>
                  <Input
                    id="age"
                    type="number"
                    min={18}
                    max={120}
                    placeholder="18"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    required
                    className="border-rose-900/40 bg-background text-sm"
                  />
                </div>
              </div>

              {/* Casilla de verificación jurada */}
              <div className="flex items-start space-x-2 pt-2 border-t border-border/60">
                <input
                  id="adult-terms"
                  type="checkbox"
                  checked={adultConfirmed}
                  onChange={(e) => setAdultConfirmed(e.target.checked)}
                  required
                  className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary accent-rose-500"
                />
                <label
                  htmlFor="adult-terms"
                  className="text-xs text-muted-foreground leading-snug cursor-pointer select-none"
                >
                  {es ? (
                    <>
                      Certifico bajo juramento que <strong className="text-foreground">soy mayor de 18 años</strong> y que mi fecha de nacimiento y edad ingresadas son reales. Comprendo que este sitio contiene rol y contenidos para adultos.
                    </>
                  ) : (
                    <>
                      I swear I am <strong className="text-foreground">at least 18 years old</strong> and my birth date is accurate.
                    </>
                  )}
                </label>
              </div>

              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? t("auth.creatingAccount") : t("auth.signUpBtn")}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t("auth.haveAccount")}{" "}
              <Link to="/login" className="text-primary hover:underline">
                {t("auth.signInLink")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Register;