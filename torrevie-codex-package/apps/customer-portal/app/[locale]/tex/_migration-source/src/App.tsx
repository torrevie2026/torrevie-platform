import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { OfflineProvider } from "@/contexts/OfflineContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";

const Login = lazy(() => import("@/pages/Login"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const NewExpense = lazy(() => import("@/pages/NewExpense"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const FinanceReview = lazy(() => import("@/pages/FinanceReview"));
const MyTeam = lazy(() => import("@/pages/MyTeam"));
const Trips = lazy(() => import("@/pages/Trips"));
const Employees = lazy(() => import("@/pages/Employees"));
const Reports = lazy(() => import("@/pages/Reports"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const AdminPanel = lazy(() => import("@/pages/AdminPanel"));
const NotificationsPage = lazy(() => import("@/pages/Notifications"));
const SetPassword = lazy(() => import("@/pages/SetPassword"));
const Demo = lazy(() => import("@/pages/Demo"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

const ProtectedPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OfflineProvider>
            <NotificationProvider>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/set-password" element={<SetPassword />} />
                  <Route path="/demo" element={<Demo />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/signup" element={<Navigate to="/login" replace />} />
                  <Route path="/onboarding" element={
                    <ProtectedRoute><Onboarding /></ProtectedRoute>
                  } />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
                  <Route path="/expenses/new" element={<ProtectedPage><NewExpense /></ProtectedPage>} />
                  <Route path="/expenses" element={<ProtectedPage><Expenses /></ProtectedPage>} />
                  <Route path="/finance-review" element={<ProtectedPage><FinanceReview /></ProtectedPage>} />
                  <Route path="/my-team" element={<ProtectedPage><MyTeam /></ProtectedPage>} />
                  <Route path="/trips" element={<ProtectedPage><Trips /></ProtectedPage>} />
                  <Route path="/employees" element={<ProtectedPage><Employees /></ProtectedPage>} />
                  <Route path="/reports" element={<ProtectedPage><Reports /></ProtectedPage>} />
                  <Route path="/settings" element={<ProtectedPage><SettingsPage /></ProtectedPage>} />
                  <Route path="/admin" element={<ProtectedPage><AdminPanel /></ProtectedPage>} />
                  <Route path="/notifications" element={<ProtectedPage><NotificationsPage /></ProtectedPage>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </NotificationProvider>
          </OfflineProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
