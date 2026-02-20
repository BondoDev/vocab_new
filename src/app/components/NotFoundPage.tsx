interface NotFoundPageProps {
  message?: string;
}

export function NotFoundPage({ message = "Page not found." }: NotFoundPageProps) {
  return (
    <main className="min-h-[calc(100vh-80px)] bg-background px-4 py-10 md:px-8 md:py-12">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-8 text-center md:p-10">
        <h1 className="text-4xl text-foreground">404</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
