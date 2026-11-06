'use client';

import { LoginForm } from '@xeva/ui';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  return <LoginForm title="Xeva Super Admin" subtitle="Internal platform administration. Xeva staff only." onSuccess={() => router.replace('/')} />;
}
