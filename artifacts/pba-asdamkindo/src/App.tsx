import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AdminOnly, AppShell, CompanyOnly, MemberOnly, Protected } from '@/components/app-shell';
import { AuthUnavailable, SignInPage, SignUpPage } from '@/pages/auth';
import { AdminDashboard, CompanyDashboard, MemberDashboard } from '@/pages/portal';
import { CompanyOnboarding, MemberOnboarding } from '@/pages/onboarding';
import { Home, ProgramDetail, Programs } from '@/pages/public';
import { Notifications } from '@/pages/notifications';
import { AdminOperations } from '@/pages/admin-operations';
import { Legal } from '@/pages/legal';
import { MemberJourney } from '@/pages/member-journey';
import { MemberPassportPage } from '@/pages/member-passport';
import { PublicPassportPage } from '@/pages/public-passport';
import { AdminTalentPoolPage } from '@/pages/admin-talent-pool';
import { CompanyTalentPoolPage } from '@/pages/company-talent-pool';
import NotFound from '@/pages/not-found';
import { useGetCurrentUser } from '@workspace/api-client-react';
import VideoWithControls from '@/components/video/VideoWithControls';
import { CompanyTalent } from '@/pages/company-talent';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function PortalRedirect() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetCurrentUser({ query: { queryKey: ['/api/me'] } });
  useEffect(() => {
    if (!isLoading && user) setLocation(!user.onboardingComplete ? (user.role === 'company' ? '/onboarding/company' : '/onboarding/member') : user.role === 'company' ? '/company/dashboard' : user.role === 'admin' || user.role === 'super_admin' ? '/admin/dashboard' : '/member/dashboard');
  }, [isLoading, user, setLocation]);
  if (isError) return <div className="grid min-h-[100dvh] place-items-center bg-background p-6 text-center"><div><p className="eyebrow text-destructive">PBA / koneksi</p><h1 className="display-font mt-3 text-3xl font-semibold">Ruang kerja belum siap.</h1><p className="mt-2 text-sm text-muted-foreground">Coba muat ulang halaman ini beberapa saat lagi.</p><button onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="button-reload-portal">Muat ulang</button></div></div>;
  return <div className="grid min-h-[100dvh] place-items-center bg-background p-6"><div className="w-full max-w-sm space-y-3"><div className="mx-auto h-10 w-10 animate-pulse rounded-xl bg-primary" /><div className="mx-auto h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="mx-auto h-3 w-1/2 animate-pulse rounded bg-muted" /></div></div>;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingEntry />;
  return isSignedIn ? <PortalRedirect /> : <Home />;
}

function EntryRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingEntry />;
  return isSignedIn ? <PortalRedirect /> : <Redirect to="/" />;
}

function LoadingEntry() {
  return <div className="grid min-h-[100dvh] place-items-center bg-background p-6"><div className="w-full max-w-sm space-y-3"><div className="mx-auto h-10 w-10 animate-pulse rounded-xl bg-primary" /><div className="mx-auto h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="mx-auto h-3 w-1/2 animate-pulse rounded bg-muted" /></div></div>;
}

function AppRoutes({ clerkReady }: { clerkReady: boolean }) {
  return <Switch>
    <Route path="/">{() => clerkReady ? <HomeRedirect /> : <Home />}</Route>
    <Route path="/sign-in/*?">{() => clerkReady ? <SignInPage /> : <AuthUnavailable />}</Route>
    <Route path="/sign-up/*?">{() => clerkReady ? <SignUpPage /> : <AuthUnavailable signup />}</Route>
    <Route path="/programs" component={Programs} />
    <Route path="/programs/:id" component={ProgramDetail} />
    <Route path="/video" component={VideoWithControls} />
    <Route path="/app">{() => clerkReady ? <EntryRoute /> : <Redirect to="/" />}</Route>
    <Route path="/member/dashboard">{() => <Protected><AppShell><MemberDashboard /></AppShell></Protected>}</Route>
    <Route path="/member/journey">{() => <Protected><AppShell><MemberJourney /></AppShell></Protected>}</Route>
    <Route path="/member/passport">{() => <Protected><MemberOnly><AppShell><MemberPassportPage /></AppShell></MemberOnly></Protected>}</Route>
    <Route path="/passport/:slug" component={PublicPassportPage} />
    <Route path="/company/dashboard">{() => <Protected><CompanyOnly><AppShell><CompanyDashboard /></AppShell></CompanyOnly></Protected>}</Route>
    <Route path="/company/talent-pool">{() => <Protected><CompanyOnly><AppShell><CompanyTalentPoolPage /></AppShell></CompanyOnly></Protected>}</Route>
    <Route path="/company/talent">{() => <Protected><CompanyOnly><AppShell><CompanyTalent /></AppShell></CompanyOnly></Protected>}</Route>
    <Route path="/admin/dashboard">{() => <Protected><AppShell><AdminDashboard /></AppShell></Protected>}</Route>
    <Route path="/admin/operations">{() => <Protected><AdminOnly><AppShell><AdminOperations /></AppShell></AdminOnly></Protected>}</Route>
    <Route path="/admin/talent-pool">{() => <Protected><AdminOnly><AppShell><AdminTalentPoolPage /></AppShell></AdminOnly></Protected>}</Route>
    <Route path="/onboarding/member">{() => <Protected><MemberOnboarding /></Protected>}</Route>
    <Route path="/onboarding/company">{() => <Protected><CompanyOnboarding /></Protected>}</Route>
    <Route path="/notifications">{() => <Protected><AppShell><Notifications /></AppShell></Protected>}</Route>
    <Route path="/privacy">{() => <Legal type="privacy" />}</Route>
    <Route path="/terms">{() => <Legal type="terms" />}</Route>
    <Route path="/403">{() => <StatusPage code="403" title="Akses dibatasi." copy="Akun Anda belum memiliki akses ke ruang ini. Hubungi admin PBA bila ini terasa keliru." />}</Route>
    <Route path="/error">{() => <StatusPage code="500" title="Ada yang perlu diperiksa." copy="Sistem sedang mengalami kendala. Silakan coba kembali beberapa saat lagi." />}</Route>
    <Route component={NotFound} />
  </Switch>;
}

function StatusPage({ code, title, copy }: { code: string; title: string; copy: string }) {
  return <div className="grid min-h-[100dvh] place-items-center bg-background px-5 text-center"><div><p className="eyebrow text-accent">{code} / pba asdamkindo</p><h1 className="display-font mt-4 text-5xl font-semibold">{title}</h1><p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">{copy}</p><a href="/" className="mt-7 inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-status-home">Kembali ke beranda</a></div></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const router = <WouterRouter base={basePath}><RoutedErrorBoundary><AppRoutes clerkReady={Boolean(clerkPubKey)} /></RoutedErrorBoundary></WouterRouter>;
  return <QueryClientProvider client={queryClient}><TooltipProvider>{clerkPubKey ? <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} appearance={{ theme: shadcn, cssLayerName: 'clerk', variables: { colorPrimary: '#f5a524', colorForeground: '#173743', colorMutedForeground: '#687778', colorBackground: '#fbfaf6', colorInput: '#f7f4ed', colorInputForeground: '#173743', colorDanger: '#ba4037', colorNeutral: '#d9d1c2', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem' }, elements: { cardBox: 'bg-[#fbfaf6] rounded-2xl border border-[#d9d1c2] shadow-lg w-full max-w-[440px] overflow-hidden', card: '!shadow-none !border-0 !bg-transparent', footer: '!shadow-none !border-0 !bg-transparent', headerTitle: 'text-[#173743] font-bold', headerSubtitle: 'text-[#687778]', formFieldLabel: 'text-[#173743] font-bold', formFieldInput: 'bg-[#f7f4ed] border-[#d9d1c2] text-[#173743]', formButtonPrimary: 'bg-[#f5a524] text-[#173743] hover:bg-[#e89716]', footerActionLink: 'text-[#307b6c] font-bold', footerActionText: 'text-[#687778]', socialButtonsBlockButton: 'border-[#d9d1c2] bg-transparent', socialButtonsBlockButtonText: 'text-[#173743] font-bold', dividerText: 'text-[#687778]', alertText: 'text-[#ba4037]' } }} localization={{ signIn: { start: { title: 'Masuk ke PBA ASDAMKINDO', subtitle: 'Lanjutkan perjalanan kompetensi Anda' } }, signUp: { start: { title: 'Buat akun PBA ASDAMKINDO', subtitle: 'Mulai membangun profil profesional Anda' } } }}>{router}</ClerkProvider> : router}<Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
