import { QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { queryClient } from "@/lib/query-client"

import { hydrateLocalProjectStore } from "@/features/studio/local-project-store"
import { isServerMode } from "@/features/studio/project-api"

import "./index.css"
import App from "./App.tsx"

function render() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>
  )
}

// The editor reads the saved local project during its first render.
if (isServerMode) render()
else void hydrateLocalProjectStore().then(render)
