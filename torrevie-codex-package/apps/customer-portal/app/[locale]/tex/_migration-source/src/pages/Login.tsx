import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Loader2, Receipt, Shield, WalletCards } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';

const Login = () => {
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
    setChecking(false);
  }, [navigate, user]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate('/');
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    try {
      await apiRequest('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      toast.success('If an account exists, a reset link has been sent.');
      setShowReset(false);
      setResetEmail('');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setResetLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-1/2 bg-[#071a2f] p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,184,166,0.20),transparent_34%),radial-gradient(circle_at_80%_75%,rgba(15,159,148,0.16),transparent_30%)]" />
        <div className="relative">
          <div className="flex items-center gap-4 text-white">
            <img src="/torrevie-logo.png" alt="Torrevie" className="h-14 w-auto" />
            <div>
              <span className="block text-2xl font-bold">Torrevie TEX</span>
              <span className="block text-sm text-teal-100/80">The Optimized Way</span>
            </div>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Expense control for travel, receipts, approvals, and finance review.
          </h1>
          <p className="text-slate-200 text-lg">
            Capture spend from web or WhatsApp, route approvals to the right manager, and keep finance close to every reimbursement.
          </p>

          <div className="space-y-4 pt-6">
            <div className="flex items-center gap-3 text-slate-100">
              <Receipt className="h-5 w-5 text-teal-300" />
              <span>Receipt-led expense submission across trips and teams</span>
            </div>
            <div className="flex items-center gap-3 text-slate-100">
              <ClipboardCheck className="h-5 w-5 text-teal-300" />
              <span>Manager approvals and finance review in one flow</span>
            </div>
            <div className="flex items-center gap-3 text-slate-100">
              <Shield className="h-5 w-5 text-teal-300" />
              <span>Policy flags, audit trails, and tenant-level control</span>
            </div>
          </div>
        </div>

        <p className="relative text-slate-300/70 text-sm">
          Copyright 2026 Torrevie. All rights reserved.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-4 text-primary">
              <img src="/torrevie-logo.png" alt="Torrevie" className="h-9 w-auto" />
              <span className="text-xl font-bold">Torrevie TEX</span>
            </div>
            <CardTitle className="text-2xl">{showReset ? 'Reset your password' : 'Welcome to Torrevie TEX'}</CardTitle>
            <CardDescription>
              {showReset ? 'Request a secure link for your workspace account' : 'Sign in to your expense operations workspace'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showReset ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@company.com"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={resetLoading}>
                  {resetLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowReset(false)} className="w-full">
                  Back to sign in
                </Button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => { setResetEmail(email); setShowReset(true); }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or</span></div>
                </div>

                <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/demo')}>
                  <WalletCards className="mr-2 h-4 w-4" />
                  Try the live demo
                </Button>
              </form>
            )}

            <p className="text-center text-sm text-muted-foreground mt-6">
              Access is by invitation only.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
