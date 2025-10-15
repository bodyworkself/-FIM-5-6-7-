export const metadata = {
  title: "脳卒中版：FIM 5→6–7 早見表",
  description: "教育・参考用（臨床判断の根拠にはしません）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
