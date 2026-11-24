/**
 * Redirects the site root to the login page.
 *
 * @returns HTTP 302 redirect to `/auth/login`.
 */
export function GET() {
  // Send the root URL to the Showcase login page.
  return new Response(null, {
    status: 302,
    headers: { Location: "/auth/login" },
  });
}
