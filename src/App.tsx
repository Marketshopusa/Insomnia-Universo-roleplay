import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AdultModeProvider } from "@/contexts/AdultModeContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

// Lazy-loaded pages to eliminate monolithic bundle and drastically speed up initial page load
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Studio = lazy(() => import("./pages/Studio"));
const MyStories = lazy(() => import("./pages/MyStories"));
const Plans = lazy(() => import("./pages/Plans"));
const StoryDetail = lazy(() => import("./pages/StoryDetail"));
const Shorts = lazy(() => import("./pages/Shorts"));
const ShortNovel = lazy(() => import("./pages/ShortNovel"));
const ShortSeries = lazy(() => import("./pages/ShortSeries"));
const ReadingHistory = lazy(() => import("./pages/ReadingHistory"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3, // 3 minutes fresh cache
      gcTime: 1000 * 60 * 30, // 30 minutes in memory
      retry: 1, // At most 1 quick retry to prevent 20-second skeleton freezes
      refetchOnWindowFocus: false, // Prevent erratic reloads when focusing the window
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <AdultModeProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/story/:storyId" element={<StoryDetail />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/studio" element={<Studio />} />
                    <Route path="/studio/kineva-local" element={<Navigate to="/studio" replace />} />
                    <Route path="/my-stories" element={<MyStories />} />
                    <Route path="/history" element={<ReadingHistory />} />
                    <Route path="/plans" element={<Plans />} />
                    <Route path="/shorts" element={<Shorts />} />
                    <Route path="/shorts/novel/:projectId" element={<ShortNovel />} />
                    <Route path="/shorts/:seriesId" element={<ShortSeries />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </TooltipProvider>
          </AdultModeProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
