import { redirect } from "next/navigation"

// Signed-out visitors never get here (proxy sends them to /login); the pantry
// layout sends people without a household to onboarding.
export default function Home() {
  redirect("/pantry")
}
