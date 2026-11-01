import "@/features/login/legacy-showcase.css";
export default function Success() {
  return (
    <main className="legacy-status-page">
      <div className="legacy-status-message">
        <h1>Success</h1>
        <p>You&apos;ve been authenticated</p>
        <span className="legacy-status-success" aria-hidden="true" />
      </div>
    </main>
  );
}
