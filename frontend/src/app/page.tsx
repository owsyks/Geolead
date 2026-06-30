import Landing from "@/components/Landing";

// `/` always serves the public marketing Landing — to logged-out and signed-in
// visitors alike. The authenticated dashboard lives at /overview (signed-in
// users land there after login; see lib/auth and the login/register redirects).
export default function HomePage() {
  return <Landing />;
}
