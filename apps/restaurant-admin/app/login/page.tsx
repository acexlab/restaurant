'use client';

import { LoginForm } from '@xeva/ui';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  return <LoginForm title="Restaurant Admin" subtitle="Sign in to manage your restaurant on Xeva." onSuccess={() => router.replace('/')} />;
}
