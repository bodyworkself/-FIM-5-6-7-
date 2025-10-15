// app/page.tsx  ← "use client" は付けない
import { redirect } from 'next/navigation';

export default function Page() {
  // ルートに来たら /evidence-cards へ 308 リダイレクト
  redirect('/evidence-cards');
}
