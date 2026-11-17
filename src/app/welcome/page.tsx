import type { Metadata } from "next"
import { Suspense } from "react"

import { WelcomeFlow } from "@/features/welcome/components/welcome-flow"

export const metadata: Metadata = {
  title: "Welcome",
  description: "One pantry and one shopping list for everyone you live with, and recipes from what you already have.",
}

// Signed-in visitors never get here: the proxy sends them on to the app.
export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeFlow />
    </Suspense>
  )
}
