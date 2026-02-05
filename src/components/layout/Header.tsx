 import { Link, useLocation } from "react-router-dom";
 import { Button } from "@/components/ui/button";
 import { useAuth } from "@/contexts/AuthContext";
 import { useLanguage } from "@/contexts/LanguageContext";
 import { LanguageSelector } from "./LanguageSelector";
 import { signOut } from "@/lib/auth";
 import { useState } from "react";
 import { Menu, X } from "lucide-react";
 
 const Logo = () => (
   <Link to="/" className="flex items-center gap-2">
     <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
       <span className="text-primary-foreground font-display text-xl font-bold">E</span>
     </div>
     <span className="font-display text-2xl italic text-primary">Erota</span>
   </Link>
 );
 
 export const Header = () => {
   const { user, loading } = useAuth();
   const location = useLocation();
   const { t } = useLanguage();
   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
 
   const navLinks = [
     { href: "/plans", label: t("nav.plans") },
     { href: "/studio", label: t("nav.novelStudio") },
     { href: "/my-stories", label: t("nav.myStories") },
     { href: "/", label: "Home" },
   ];
 
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
                   location.pathname === link.href
                     ? "text-primary"
                     : "text-muted-foreground"
                 }`}
               >
                 {link.label}
               </Link>
             ))}
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
               {navLinks.map((link) => (
                 <Link
                   key={link.href}
                   to={link.href}
                   onClick={() => setMobileMenuOpen(false)}
                   className={`text-sm font-medium transition-colors hover:text-primary ${
                     location.pathname === link.href
                       ? "text-primary"
                       : "text-muted-foreground"
                   }`}
                 >
                   {link.label}
                 </Link>
               ))}
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
     </header>
   );
 };