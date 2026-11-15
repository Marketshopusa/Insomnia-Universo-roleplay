import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelector } from "./LanguageSelector";
import { signOut } from "@/lib/auth";
import { useState } from "react";
import { Menu, X, ShieldAlert, ShieldCheck, Crown } from "lucide-react";
import { useAdultMode } from "@/contexts/AdultModeContext";
import { AdultConsentDialog } from "@/components/adult/AdultConsentDialog";
import { MotherCardDialog } from "@/components/story/MotherCardDialog";

const Logo = () => (
  <Link to="/" className="flex items-center gap-2">
    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-accent shadow-[0_0_20px_hsl(var(--primary)/0.5)]">
      <span className="text-primary-foreground font-display text-xl font-bold italic">I</span>
    </div>
    <span className="font-display text-2xl italic bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Insomnia</span>
  </Link>
);

export const Header = () => {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { enabled: adultEnabled, consentGiven, enable, disable, grantConsent } = useAdultMode();
  const [consentOpen, setConsentOpen] = useState(false);
  const [motherCardOpen, setMotherCardOpen] = useState(false);

  const handleAdultToggle = () => {
    if (adultEnabled) {
      disable();
      return;
    }
    if (consentGiven) {
      enable();
    } else {
      setConsentOpen(true);
    }
  };

  const handleConsent = () => {
    grantConsent();
    enable();
    setConsentOpen(false);
  };

  const navLinks = [
    { href: "/", label: t("nav.home") },
    { href: "/chat", label: t("nav.chat") || "Chat" },
    { href: "/shorts", label: t("nav.shorts") },
    { href: "/studio", label: t("nav.novelStudio") },
    { href: "/my-stories", label: t("nav.myStories") },
    { href: "/history", label: t("nav.history") },
    { href: "/plans", label: t("nav.plans") },
  ];
  const linkActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    if (href.includes("#")) return location.pathname + location.hash === href;
    const path = href.split("#")[0];
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Logo />
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  linkActive(link.href)
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}

            {/* Admin Badge & Mother Card Trigger */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setMotherCardOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-500/25 to-amber-500/20 border border-amber-500/50 hover:border-amber-400 text-amber-300 text-xs font-bold tracking-wide shadow-md shadow-amber-950/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                title="Configuración de Tarjeta Madre (Roleplay Base)"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>TARJETA MADRE</span>
              </button>
            )}

            <button
              onClick={handleAdultToggle}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                adultEnabled
                  ? "bg-destructive/10 border-destructive/40 text-destructive hover:bg-destructive/20"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              title={adultEnabled ? t("adult.disable") : t("adult.enable")}
            >
              {adultEnabled ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              <span>18+</span>
            </button>
            <LanguageSelector />
            {loading ? (
              <div className="w-16 h-9 bg-muted animate-pulse rounded" />
            ) : user ? (
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                {t("nav.logout")}
              </Button>
            ) : (
              <Link to="/login">
                <Button variant="outline" size="sm">
                  {t("nav.login")}
                </Button>
              </Link>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <button
            type="button"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setMotherCardOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold"
                >
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span>ADMIN: Configurar Tarjeta Madre</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">BASE</span>
                </button>
              )}
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    linkActive(link.href)
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={handleAdultToggle}
                className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md border transition-colors ${
                  adultEnabled
                    ? "bg-destructive/10 border-destructive/40 text-destructive"
                    : "border-border text-muted-foreground"
                }`}
              >
                {adultEnabled ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                <span>{adultEnabled ? t("adult.on") : t("adult.off")}</span>
              </button>
              {!loading && (
                user ? (
                  <Button variant="outline" size="sm" onClick={handleSignOut}>
                    {t("nav.logout")}
                  </Button>
                ) : (
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" size="sm" className="w-full">
                      {t("nav.login")}
                    </Button>
                  </Link>
                )
              )}
            </div>
          </nav>
        )}
      </div>
      <AdultConsentDialog
        open={consentOpen}
        onConfirm={handleConsent}
        onCancel={() => setConsentOpen(false)}
      />
    </header>
  );
};
