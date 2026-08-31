import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { SignIn, SignUp } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { Link } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
export function SignInPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-background px-4 py-10"><div className="w-full max-w-[440px]"><Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground" data-testid="link-auth-home"><ArrowLeft size={16} /> PBA ASDAMKINDO</Link><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} appearance={appearance} /></div></div>;
}
export function SignUpPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-background px-4 py-10"><div className="w-full max-w-[440px]"><Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground" data-testid="link-auth-home-signup"><ArrowLeft size={16} /> PBA ASDAMKINDO</Link><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} appearance={appearance} /></div></div>;
}
export function AuthUnavailable({ signup = false }: { signup?: boolean }) {
  return <div className="grid min-h-[100dvh] place-items-center bg-sidebar px-5 text-center text-sidebar-foreground"><div className="max-w-md"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary text-primary-foreground"><ShieldCheck size={28} /></div><p className="eyebrow mt-7 text-primary">PBA ASDAMKINDO</p><h1 className="display-font mt-3 text-4xl font-semibold">{signup ? 'Buat akun PBA' : 'Masuk ke PBA'}</h1><p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/60">Auth sedang disiapkan untuk workspace ini. Setelah Clerk terhubung, halaman ini akan menjadi pintu masuk akun Anda.</p><Link href="/" className="mt-7 inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-auth-unavailable-home">Kembali ke beranda</Link></div></div>;
}
const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  variables: { colorPrimary: '#f5a524', colorForeground: '#173743', colorMutedForeground: '#687778', colorBackground: '#fbfaf6', colorInput: '#f7f4ed', colorInputForeground: '#173743', colorDanger: '#ba4037', colorNeutral: '#d9d1c2', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem' },
  elements: { cardBox: 'bg-[#fbfaf6] rounded-2xl border border-[#d9d1c2] shadow-lg w-full overflow-hidden', card: '!shadow-none !border-0 !bg-transparent', footer: '!shadow-none !border-0 !bg-transparent', headerTitle: 'text-[#173743] font-bold', headerSubtitle: 'text-[#687778]', formFieldLabel: 'text-[#173743] font-bold', formFieldInput: 'bg-[#f7f4ed] border-[#d9d1c2] text-[#173743]', formButtonPrimary: 'bg-[#f5a524] text-[#173743] hover:bg-[#e89716]', footerActionLink: 'text-[#307b6c] font-bold', footerActionText: 'text-[#687778]', socialButtonsBlockButton: 'border-[#d9d1c2] bg-transparent', socialButtonsBlockButtonText: 'text-[#173743] font-bold', dividerText: 'text-[#687778]', alertText: 'text-[#ba4037]' },
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
};