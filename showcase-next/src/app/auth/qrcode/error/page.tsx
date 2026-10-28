export default function Failure() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold">Failure</h1>
      <p className="mt-4 text-muted-foreground">Authentication unsuccessful</p>
      <a className="mt-6 inline-block text-primary" href="/auth/login">
        Try again
      </a>
    </main>
  );
}
