 import { Toaster } from "@/components/ui/toaster";
 import { Toaster as Sonner } from "@/components/ui/sonner";
 import { TooltipProvider } from "@/components/ui/tooltip";
 import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
 import { BrowserRouter, Routes, Route } from "react-router-dom";
 import { AuthProvider } from "@/contexts/AuthContext";
 import { LanguageProvider } from "@/contexts/LanguageContext";
import { AdultModeProvider } from "@/contexts/AdultModeContext";
 import Index from "./pages/Index";
 import NotFound from "./pages/NotFound";
 import Login from "./pages/Login";
 import Register from "./pages/Register";
 import Studio from "./pages/Studio";
 import MyStories from "./pages/MyStories";
 import Plans from "./pages/Plans";
 import StoryDetail from "./pages/StoryDetail";
import Shorts from "./pages/Shorts";
 
 const queryClient = new QueryClient();
 
 const App = () => (
   <QueryClientProvider client={queryClient}>
     <LanguageProvider>
       <AuthProvider>
          <AdultModeProvider>
          <TooltipProvider>
           <Toaster />
           <Sonner />
           <BrowserRouter>
             <Routes>
               <Route path="/" element={<Index />} />
               <Route path="/story/:storyId" element={<StoryDetail />} />
               <Route path="/login" element={<Login />} />
               <Route path="/register" element={<Register />} />
               <Route path="/studio" element={<Studio />} />
               <Route path="/my-stories" element={<MyStories />} />
               <Route path="/plans" element={<Plans />} />
               <Route path="/shorts" element={<Shorts />} />
               {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
               <Route path="*" element={<NotFound />} />
             </Routes>
           </BrowserRouter>
          </TooltipProvider>
          </AdultModeProvider>
       </AuthProvider>
     </LanguageProvider>
   </QueryClientProvider>
 );
 
 export default App;
