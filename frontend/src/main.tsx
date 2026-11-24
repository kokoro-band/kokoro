import { QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { queryClient } from "@/lib/query-client"

import "./index.css"
import App from "./App.tsx"
import { AuthGate } from "@/features/studio/components/AuthGate"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <App />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>
)
