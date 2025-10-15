// app/page.tsx  （サーバーコンポーネントのまま・"use client" は書かない）
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/evidence-cards'); // 307
}
